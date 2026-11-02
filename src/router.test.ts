import { describe, expect, it } from 'vitest';
import { editorHref, parseRoute, studioHref } from './router';

describe('routes', () => {
  it('sends the root and anything unknown to the diorama', () => {
    expect(parseRoute('/')).toEqual({ page: 'diorama' });
    expect(parseRoute('/models/house.glb')).toEqual({ page: 'diorama' });
    // Deeper than the studio owns: not a route, so the diorama renders rather than a blank page.
    expect(parseRoute('/characters/dekisugi/walk')).toEqual({ page: 'diorama' });
  });
  it('reads the studio with and without a character', () => {
    expect(parseRoute('/characters')).toEqual({ page: 'studio', characterId: null });
    expect(parseRoute('/characters/')).toEqual({ page: 'studio', characterId: null });
    expect(parseRoute('/characters/dekisugi')).toEqual({ page: 'studio', characterId: 'dekisugi' });
    // An id that is not a character still parses; the page resolves it to a real one.
    expect(parseRoute('/characters/nobody')).toEqual({ page: 'studio', characterId: 'nobody' });
  });
  it('reads the house editor, and nothing under it', () => {
    expect(parseRoute('/editor')).toEqual({ page: 'editor' });
    expect(parseRoute('/editor/')).toEqual({ page: 'editor' });
    expect(parseRoute('/editor/rooms')).toEqual({ page: 'diorama' });
  });
  it('round-trips hrefs through the parser', () => {
    expect(parseRoute(studioHref())).toEqual({ page: 'studio', characterId: null });
    expect(parseRoute(studioHref('jaian'))).toEqual({ page: 'studio', characterId: 'jaian' });
    expect(parseRoute(editorHref)).toEqual({ page: 'editor' });
  });
});
