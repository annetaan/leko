import type { Case } from '../case.js'
import { adjacentColumns } from './adjacent-columns.js'
import { asyncCompletion } from './async-completion.js'
import { branching } from './branching.js'
import { fixedChrome } from './fixed-chrome.js'
import { formValidation } from './form-validation.js'
import { haloFollows } from './halo-follows.js'
import { hiddenTarget } from './hidden-target.js'
import { insideShadowDom } from './inside-shadow-dom.js'
import { linkedRegions } from './linked-regions.js'
import { lookThenUse } from './look-then-use.js'
import { messageSides } from './message-sides.js'
import { nestedScroller } from './nested-scroller.js'
import { nextControl } from './next-control.js'
import { scrollableTarget } from './scrollable-target.js'
import { scrollsIntoView } from './scrolls-into-view.js'
import { stagedScroll } from './staged-scroll.js'
import { stepping } from './stepping.js'
import { stepSetup } from './step-setup.js'
import { storySetup } from './story-setup.js'
import { styledTour } from './styled-tour.js'
import { svgTarget } from './svg-target.js'
import { targetNotThereYet } from './target-not-there-yet.js'
import { twoStories } from './two-stories.js'

// The plain one first, because it is the one to open while working on the
// rendering — nothing to type before a step will move. After it, the order the
// design was argued in: what a tour is for, then the shapes a cutout has to
// take, then the situations that break naive implementations.
export const cases: Case[] = [
  stepping,
  lookThenUse,
  styledTour,
  haloFollows,
  formValidation,
  nextControl,
  asyncCompletion,
  stepSetup,
  storySetup,
  twoStories,
  branching,
  adjacentColumns,
  linkedRegions,
  nestedScroller,
  scrollableTarget,
  scrollsIntoView,
  stagedScroll,
  fixedChrome,
  messageSides,
  targetNotThereYet,
  hiddenTarget,
  insideShadowDom,
  svgTarget,
]
