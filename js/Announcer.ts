// Copyright 2021-2022, University of Colorado Boulder

/**
 * Abstract base class for the type that wires into an UtteranceQueue to announce Utterances.
 *
 * @author Michael Kauzmann (PhET Interactive Simulations)
 */

import Emitter from '../../axon/js/Emitter.js';
import optionize from '../../phet-core/js/optionize.js';
import PhetioObject, { PhetioObjectOptions } from '../../tandem/js/PhetioObject.js';
import Tandem from '../../tandem/js/Tandem.js';
import IOType from '../../tandem/js/types/IOType.js';
import StringIO from '../../tandem/js/types/StringIO.js';
import Utterance from './Utterance.js';
import utteranceQueueNamespace from './utteranceQueueNamespace.js';
import UtteranceWrapper from './UtteranceWrapper.js';

type SelfOptions = {
  respectResponseCollectorProperties?: boolean;
}

export type AnnouncerOptions = SelfOptions & PhetioObjectOptions;

abstract class Announcer extends PhetioObject {

  // @protected (read-only) - When an Utterance to be announced provided an alert in `ResponsePacket`-form, whether or
  // not to listen to the current values of responseCollector Properties, or to just combine all pieces of it no matter.
  respectResponseCollectorProperties: boolean;

  // A flag that indicates to an UtteranceQueue that this Announcer is ready to speak the next Utterance.
  readyToAnnounce: boolean;

  // @public {Emitter} - Emits an event when this Announcer is finished with an Utterance. It is up
  // to the Announcer subclass to emit this because different speech technologies may have different APIs
  // to determine when speaking is finished.
  announcementCompleteEmitter: Emitter<[ Utterance, string ]>;

  constructor( providedOptions: AnnouncerOptions ) {
    const options = optionize<AnnouncerOptions, SelfOptions, PhetioObjectOptions, 'tandem'>( {
      respectResponseCollectorProperties: true,

      tandem: Tandem.OPTIONAL,
      phetioType: Announcer.AnnouncerIO,
      phetioState: false
    }, providedOptions );

    super( options );

    this.respectResponseCollectorProperties = options.respectResponseCollectorProperties;

    this.readyToAnnounce = true;

    this.announcementCompleteEmitter = new Emitter( {
      parameters: [ { name: 'utterance', phetioType: Utterance.UtteranceIO }, { name: 'text', phetioType: StringIO } ],
      tandem: options.tandem.createTandem( 'announcementCompleteEmitter' ),
      phetioReadOnly: true,
      phetioDocumentation: 'The announcement that has just completed. The Utterance text could potentially differ from ' +
                           'the exact text that was announced, so both are emitted. Use `text` for an exact match of what was announced.'
    } );
  }

  /**
   * Announce an alert, setting textContent to an aria-live element.
   *
   * @param utterance - Utterance with content to announce
   * @param [options] - specify support for options particular to this announcer's features.
   * @abstract
   */
  announce( utterance: Utterance, options?: any ): void {
    throw new Error( 'announce() must be overridden by subtype' );
  }

  /**
   * Cancel announcement if this Announcer is currently announcing the Utterance. Does nothing
   * to queued Utterances. The announcer needs to implement cancellation of speech.
   * @abstract
   */
  cancelUtterance( utterance: Utterance ): void {
    throw new Error( 'announce() must be overridden by subtype' );
  }

  /**
   * Cancel announcement of any Utterance that is being spoken. The announcer needs to implement canellation of speech.
   * @abstract
   * @public
   */
  cancel() {
    throw new Error( 'cancel() must be overridden by subtype' );
  }

  /**
   * Determine if one utterance should cancel another. Default behavior for this superclass is to cancel when
   * the new Utterance is of higher priority. But subclasses may re-implement this function if it has special logic
   * or announcerOptions that override this behavior.
   */
  shouldUtteranceCancelOther( utterance: Utterance, utteranceToCancel: Utterance ): boolean {
    return utteranceToCancel.priorityProperty.value < utterance.priorityProperty.value;
  }

  /**
   * Intended to be overridden by subtypes if necessary as a way to order the queue if there is announcer
   * specific logic.
   */
  onUtterancePriorityChange( utterance: Utterance ) {}

  /**
   * Intended to be overridden by subtypes if necessary as a way to implement dynamic behavior of the Announcer.
   * @public
   *
   * @param {number} dt - in milliseconds
   * @param {UtteranceWrapper[]} queue
   */
  step( dt: number, queue: UtteranceWrapper[] ) {}

  static AnnouncerIO = new IOType( 'AnnouncerIO', {
    valueType: Announcer,
    documentation: 'Announces text to a specific browser technology (like aria-live or web speech)'
  } );
}

utteranceQueueNamespace.register( 'Announcer', Announcer );
export default Announcer;