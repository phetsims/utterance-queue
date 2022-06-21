// Copyright 2022, University of Colorado Boulder

/**
 * A type to wrap an Utterance while in the UtteranceQueue, see UtteranceQueue for implementation. Internal to
 * utterance-queue, should otherwise not need to be used.
 *
 * @author Jesse Greenberg
 * @author Michael Kauzmann (PhET Interactive Simulations)
 */

import utteranceQueueNamespace from './utteranceQueueNamespace.js';
import Utterance from './Utterance.js';

// One instance per entry in the UtteranceQueue.queue
class UtteranceWrapper {

  // In ms, how long this utterance has been in the queue. The
  // same Utterance can be in the queue more than once (for utterance looping or while the utterance stabilizes),
  // in this case the time will be since the first time the utterance was added to the queue.
  public timeInQueue: number;

  // in ms, how long this utterance has been "stable", which
  // is the amount of time since this utterance has been added to the utteranceQueue.
  public stableTime: number;
  public utterance: Utterance;

  // A reference to a listener on the Utterance priorityProperty while this Utterance
  // is being announced by the Announcer.
  public announcingUtterancePriorityListener: ( ( priority: number ) => void ) | null;

  public constructor( utterance: Utterance ) {

    this.utterance = utterance;

    this.timeInQueue = 0;

    this.stableTime = 0;

    this.announcingUtterancePriorityListener = null;
  }

  /**
   * Reset variables that track instance variables related to time.
   */
  public resetTimingVariables(): void {
    this.timeInQueue = 0;
    this.stableTime = 0;
  }
}

utteranceQueueNamespace.register( 'UtteranceWrapper', UtteranceWrapper );
export default UtteranceWrapper;