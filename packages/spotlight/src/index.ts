/**
 * The drawing half of Leko: the scrim, the hole cut in it, and the message put
 * beside that hole. Nothing here knows what a step or a story is.
 *
 * Private for now. `@annetaan/leko` is the package anyone installs, and this is
 * where the part of it that touches layout lives.
 *
 * What is exported is what `@annetaan/leko` imports and nothing else. The
 * geometry has plenty of other pure functions, and each is reached from inside
 * this package by importing the module it lives in, which is what the tests do
 * too. A name here that no consumer names is a promise this package is not
 * making.
 */
export {
  cubicBezier,
  type Cutout,
  ease,
  type Easing,
  grow,
  type Rect,
  type Side,
  union,
} from './geometry.js'
export { type ResolveMode, resolveTarget, resolveTargets } from './target.js'
export { Close } from './close.js'
export { FocusRing } from './focus.js'
export { Message, type MessageContent } from './message.js'
export { type HaloMode, type Reading, Scrim } from './scrim.js'
export { bringIntoView, type Glide, type ScrollMode } from './glide.js'
export {
  chainOf,
  paddingBoxWithin,
  portsOf,
  roomIn,
  sameSurface,
  type Surface,
  withinSurface,
} from './surface.js'
