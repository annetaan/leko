import type { Case } from '../case.js'
import { adjacentColumns } from './adjacent-columns.js'
import { asyncCompletion } from './async-completion.js'
import { branching } from './branching.js'
import { formValidation } from './form-validation.js'
import { lateReason } from './late-reason.js'
import { linkedRegions } from './linked-regions.js'
import { nestedScroller } from './nested-scroller.js'
import { nextControl } from './next-control.js'
import { scrollableTarget } from './scrollable-target.js'
import { stepping } from './stepping.js'
import { stepSetup } from './step-setup.js'
import { storySetup } from './story-setup.js'
import { targetDisappears } from './target-disappears.js'
import { twoStories } from './two-stories.js'

// The plain one first, because it is the one to open while working on the
// rendering — nothing to type before a step will move. After it, the order the
// design was argued in: what a tour is for, then the shapes a cutout has to
// take, then the situations that break naive implementations.
export const cases: Case[] = [
  stepping,
  formValidation,
  lateReason,
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
  targetDisappears,
]
