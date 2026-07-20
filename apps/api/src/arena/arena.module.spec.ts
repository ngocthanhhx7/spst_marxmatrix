import { describe, expect, it } from 'vitest';
import { ArenaGateway } from './arena.gateway.js';
import { ArenaModule, ArenaRealtimeModule } from './arena.module.js';

describe('Arena realtime module wiring', () => {
  it('registers the gateway and globally shared publisher module', () => {
    expect(Reflect.getMetadata('providers', ArenaModule)).toContain(ArenaGateway);
    expect(Reflect.getMetadata('imports', ArenaModule)).toContain(ArenaRealtimeModule);
  });
});
