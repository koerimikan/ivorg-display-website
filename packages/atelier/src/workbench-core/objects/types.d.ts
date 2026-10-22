export interface TransitionBinding {
  objectId: string;
  type: 'TransitionBinding';
  transitionObjectId: string;
  fields: {
    id: string; fromPage: string; toPage: string; definitionRef: string;
    linkRef?: string;
    trigger: 'click' | 'wheel' | 'touch' | 'pageLoad' | 'componentEvent';
    effect: 'cover' | 'uncover' | 'inPlace' | 'none';
    enabled: 'true' | 'false'; deckCursor?: string; guard?: string;
  };
}
export interface TransitionInstance {
  readonly instanceId: string;
  readonly sessionId: string;
  readonly instanceSeq: number;
  readonly bindingRef: string;
  readonly definitionRef: string;
  readonly deckCursorAtStart: number;
  readonly recordedBy: 'fixture';
}
export interface ReadOnlyActor {
  readonly userId: 'local-owner';
  readonly projectId: string;
  readonly sessionId: string;
  readonly scope: 'project-read-only';
  readonly capabilities: readonly ['analyze', 'explain', 'measure'];
  readonly authenticatedBy: 'trusted-loopback-p1';
}
export interface WorkbenchEvent {
  seq: number; kind: string; actorUserId: string; projectId: string; sessionId: string;
}
