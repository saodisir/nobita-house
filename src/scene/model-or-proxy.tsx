import { useGLTF } from '@react-three/drei';
import type { ReactNode } from 'react';
import { Component, Suspense } from 'react';
import type { AnimationClip, Group } from 'three';
import { useAppStore } from '../state/store';

export interface LoadedGltf {
  scene: Group;
  animations: AnimationClip[];
}

interface Props {
  url: string;
  /** Rendered when the GLB is missing (or until preflight finishes). */
  proxy: ReactNode;
  /** Receives the loaded scene; lets the caller add animation/handlers. */
  children: (gltf: LoadedGltf) => ReactNode;
}

/** Renders the real GLB when it exists on the server, otherwise a placeholder. Never throws on 404. */
export function ModelOrProxy({ url, proxy, children }: Props) {
  const available = useAppStore((s) => s.availableModels[url] === true);
  if (!available) return <>{proxy}</>;
  return (
    // The preflight is a HEAD: the GET can still fail afterwards (dropped connection, a proxy
    // returning an empty body, a truncated file). Without this boundary that throw propagates
    // to the R3F root and unmounts the whole canvas — one bad character blanks the diorama.
    // Keyed on the url so a later character with a working model is not held in the failed state.
    <ModelBoundary key={url} url={url} fallback={proxy}>
      <Suspense fallback={proxy}>
        <Loaded url={url}>{children}</Loaded>
      </Suspense>
    </ModelBoundary>
  );
}

class ModelBoundary extends Component<
  { url: string; fallback: ReactNode; children: ReactNode },
  { failed: boolean }
> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error: unknown) {
    // A failed model is a degraded scene, not a broken app: say which one, keep rendering.
    console.warn(`[model] ${this.props.url} failed to load; showing the placeholder instead`, error);
    // drei caches the rejected promise, so a retry of this url would rethrow the same error.
    useGLTF.clear(this.props.url);
  }

  render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}

function Loaded({ url, children }: Pick<Props, 'url' | 'children'>) {
  const gltf = useGLTF(url);
  // useGLTF is typed for string | string[]; a single url always yields a single result.
  return <>{children(gltf as LoadedGltf)}</>;
}
