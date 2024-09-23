// Copyright 2022-2024, University of Colorado Boulder

/**
 * A type to wrap an Utterance while in the UtteranceQueue, see UtteranceQueue for implementation. Internal to
 * utterance-queue, should otherwise not need to be used.
 *
 * @author Jesse Greenberg
 * @author Michael Kauzmann (PhET Interactive Simulations)
 */

import Disposable from '../../axon/js/Disposable.js';
import Utterance from './Utterance.js';
import utteranceQueueNamespace from './utteranceQueueNamespace.js';

type PriorityListener = ( priority: number ) => void;

// One instance per entry in the UtteranceQueue.queue
class UtteranceWrapper extends Disposable {

  // In ms, how long this utterance has been in the queue. The
  // same Utterance can be in the queue more than once (for utterance looping or while the utterance stabilizes),
  // in this case the time will be since the first time the utterance was added to the queue.
  public timeInQueue = 0;

  // is the amount of time since this utterance has been added to the utteranceQueue.
  public stableTime = 0;

  // A reference to a listener on the Utterance priorityProperty while this Utterance
  // is moving through the UtteranceQueue (in the queue and currently being announced). We want to monitor for priority
  // changes to adjust its spot in line when needed.
  public utterancePriorityListener: PriorityListener | null = null;

  public constructor( public readonly utterance: Utterance ) {
    super();
  }

  public override dispose(): void {

    // The same Utterance may exist multiple times in the queue if we are removing duplicates from the array,
    // so the listener may have already been removed.
    if ( this.utterancePriorityListener ) {
      this.utterance.priorityProperty.unlink( this.utterancePriorityListener );
      this.utterancePriorityListener = null;
    }

    super.dispose();
  }
}

utteranceQueueNamespace.register( 'UtteranceWrapper', UtteranceWrapper );
export default UtteranceWrapper;