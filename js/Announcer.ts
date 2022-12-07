// Copyright 2021-2022, University of Colorado Boulder

/**
 * Abstract base class for the type that wires into an UtteranceQueue to announce Utterances.
 *
 * @author Michael Kauzmann (PhET Interactive Simulations)
 */

import Emitter from '../../axon/js/Emitter.js';
import TEmitter from '../../axon/js/TEmitter.js';
import optionize, { EmptySelfOptions } from '../../phet-core/js/optionize.js';
import PhetioObject, { PhetioObjectOptions } from '../../tandem/js/PhetioObject.js';
import Tandem from '../../tandem/js/Tandem.js';
import IOType from '../../tandem/js/types/IOType.js';
import NullableIO from '../../tandem/js/types/NullableIO.js';
import NumberIO from '../../tandem/js/types/NumberIO.js';
import OrIO from '../../tandem/js/types/OrIO.js';
import StringIO from '../../tandem/js/types/StringIO.js';
import { ResolvedResponse } from './ResponsePacket.js';
import Utterance from './Utterance.js';
import utteranceQueueNamespace from './utteranceQueueNamespace.js';

type SelfOptions = {
  respectResponseCollectorProperties?: boolean;
};

// Options for the announce method
export type AnnouncerAnnounceOptions = EmptySelfOptions;

export type AnnouncerOptions = SelfOptions & PhetioObjectOptions;

abstract class Announcer extends PhetioObject {

  // When an Utterance to be announced provided an alert in `ResponsePacket`-form, whether or
  // not to listen to the current values of responseCollector Properties, or to just combine all pieces of it no matter.
  public readonly respectResponseCollectorProperties: boolean;

  // A flag that indicates to an UtteranceQueue that this Announcer is ready to speak the next Utterance.
  public readyToAnnounce = true;

  // A flag that indicates whether this announcer has successfully spoken at least once.
  public hasSpoken = false;

  // Emits an event when this Announcer is finished with an Utterance. It is up
  // to the Announcer subclass to emit this because different speech technologies may have different APIs
  // to determine when speaking is finished.
  public readonly announcementCompleteEmitter: TEmitter<[ Utterance, ResolvedResponse ]>;

  public constructor( providedOptions?: AnnouncerOptions ) {
    const options = optionize<AnnouncerOptions, SelfOptions, PhetioObjectOptions>()( {
      respectResponseCollectorProperties: true,

      tandem: Tandem.OPTIONAL,
      phetioType: Announcer.AnnouncerIO,
      phetioState: false
    }, providedOptions );

    super( options );

    this.respectResponseCollectorProperties = options.respectResponseCollectorProperties;

    this.announcementCompleteEmitter = new Emitter( {
      parameters: [ {
        name: 'utterance', phetioType: Utterance.UtteranceIO
      }, {
        name: 'text',
        phetioType: NullableIO( OrIO( [ StringIO, NumberIO ] ) )
      } ],
      tandem: options.tandem.createTandem( 'announcementCompleteEmitter' ),
      phetioReadOnly: true,
      phetioDocumentation: 'The announcement that has just completed. The Utterance text could potentially differ from ' +
                           'the exact text that was announced, so both are emitted. Use `text` for an exact match of what was announced.'
    } );
  }

  /**
   * Announce an alert, setting textContent to an aria-live element.
   *
   * @param announceText - The string that was formulated from the utterance
   * @param utterance - Utterance with content to announce
   * @param [providedOptions] - specify support for options particular to this announcer's features.
   */
  public abstract announce( announceText: ResolvedResponse, utterance: Utterance, providedOptions?: AnnouncerAnnounceOptions ): void;

  /**
   * Cancel announcement if this Announcer is currently announcing the Utterance. Does nothing
   * to queued Utterances. The announcer needs to implement cancellation of speech.
   */
  public abstract cancelUtterance( utterance: Utterance ): void;

  /**
   ’   * Cancel announcement of any Utterance that is being spoken. The announcer needs to implement cancellation of speech.
   */
  public abstract cancel(): void;

  /**
   * Determine if one utterance should cancel another. Default behavior for this superclass is to cancel when
   * the new Utterance is of higher priority. But subclasses may re-implement this function if it has special logic
   * or announcerOptions that override this behavior.
   */
  public shouldUtteranceCancelOther( utterance: Utterance, utteranceToCancel: Utterance ): boolean {
    return utteranceToCancel.priorityProperty.value < utterance.priorityProperty.value;
  }

  /**
   * Intended to be overridden by subtypes if necessary as a way to order the queue if there is announcer
   * specific logic.
   */
  public onUtterancePriorityChange( utterance: Utterance ): void {
    // See subclass for implementation
  }

  public static AnnouncerIO = new IOType( 'AnnouncerIO', {
    valueType: Announcer,
    documentation: 'Announces text to a specific browser technology (like aria-live or web speech)'
  } );
}

utteranceQueueNamespace.register( 'Announcer', Announcer );
export default Announcer;