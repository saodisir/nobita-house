import { lazy, StrictMode, Suspense } from 'react';
import { createRoot } from 'react-dom/client';
import { useRoute } from './router';
import './styles/app.css';

// Three pages, three chunks: no page carries another's scene graph.
const Diorama = lazy(() => import('./app').then((m) => ({ default: m.App })));
const Studio = lazy(() => import('./studio/studio-app'));
const Editor = lazy(() => import('./editor/editor-app'));

function Page() {
  const route = useRoute();
  if (route.page === 'studio') return <Studio characterId={route.characterId} />;
  if (route.page === 'editor') return <Editor />;
  return <Diorama />;
}

function Pages() {
  return (
    // Each page draws its own loading state (the veil, or the model proxy), so the chunk swap
    // needs nothing here.
    <Suspense fallback={null}>
      <Page />
    </Suspense>
  );
}

const root = document.getElementById('root');
if (!root) throw new Error('#root missing');
createRoot(root).render(
  <StrictMode>
    <Pages />
  </StrictMode>,
);
