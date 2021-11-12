// Copyright 2021, University of Colorado Boulder

/**
 * Abstract base class for the type that wires into an UtteranceQueue to announce Utterances.
 *
 * @author Michael Kauzmann (PhET Interactive Simulations)
 */

import Emitter from '../../axon/js/Emitter.js';
import merge from '../../phet-core/js/merge.js';
import utteranceQueueNamespace from './utteranceQueueNamespace.js';

class Announcer {

  constructor( options ) {
    options = merge( {
      respectResponseCollectorProperties: true
    }, options );

    // @protected (read-only) - When an Utterance to be announced provided an alert in `ResponsePacket`-form, whether or
    // not to listen to the current values of responseCollector Properties, or to just combine all pieces of it no matter.
    this.respectResponseCollectorProperties = options.respectResponseCollectorProperties;

    // @public {boolean} - A flag that indicates to an UtteranceQueue that this announcer is ready to speak the next
    // utterance.
    this.readyToSpeak = true;

    // @public {Emitter} - Signify that this announcer expects UtteranceQueues to clear.
    this.clearEmitter = new Emitter();
  }

  /**
   * Announce an alert, setting textContent to an aria-live element.
   * @public
   *
   * @param {Utterance} utterance - Utterance with content to announce
   * @param {Object} [options] - specify support for options particular to this announcer's features.
   * @abstract
   */
  announce( utterance, options ) {
    throw new Error( 'announce() must be overridden by subtype' );
  }

  /**
   * Intended to be overridden by subtypes if necessary as a way to order the queue if there is announcer
   * specific logic.
   * @public
   *
   * @param {Utterance} utterance
   * @param {UtteranceWrapper[]} queue - The UtteranceQueue list - can be modified by this function!
   */
  prioritizeUtterances( utterance, queue ) {}

  /**
   * Intended to be overridden by subtypes if necessary as a way to implement dynamic behavior of the Announcer.
   * @public
   *
   * @param {number} dt - in milliseconds
   * @param {UtteranceWrapper[]} queue
   */
  step( dt, queue ) {}
}

utteranceQueueNamespace.register( 'Announcer', Announcer );
export default Announcer;