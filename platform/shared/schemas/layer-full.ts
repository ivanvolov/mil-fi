import { z } from 'zod';
import { Layer } from './layer.js';
import { Interceptor } from './interceptor.js';
import { Threat } from './threat.js';
import { Team } from './team.js';
import { Thread } from './thread.js';
import { Drawing } from './drawing.js';
import { InterceptorType } from './interceptor-type.js';
import { ThreatType } from './threat-type.js';

export const LayerFull = z.object({
  layer: Layer,
  types: z.object({
    interceptor: z.array(InterceptorType),
    threat: z.array(ThreatType),
  }),
  interceptors: z.array(Interceptor),
  threats: z.array(Threat),
  teams: z.array(Team),
  threads: z.array(Thread),
  drawings: z.array(Drawing),
});

export type LayerFull = z.infer<typeof LayerFull>;
