/**
 * The drawing half of Leko: the scrim, the hole cut in it, and the message put
 * beside that hole. Nothing here knows what a step or a story is.
 *
 * Private for now. `@annetaan/leko` is the package anyone installs, and this is
 * where the part of it that touches layout lives.
 */
export {
  collapse,
  type Corner,
  CORNERS,
  cornerRect,
  type Cutout,
  complementRects,
  freeCorner,
  grow,
  lerpPath,
  padCutouts,
  punchedPath,
  type Rect,
  resolveTarget,
  resolveTargets,
  roundedRectPath,
  segmentAt,
  type Target,
  union,
} from './geometry.js'
export { Close } from './close.js'
export { Message, type MessageContent } from './message.js'
export {
  findScrollContainer,
  paddingBoxWithin,
  prefersReducedMotion,
  rectWithin,
  Scrim,
} from './scrim.js'
