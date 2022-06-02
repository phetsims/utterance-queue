// Copyright 2022, University of Colorado Boulder

/**
 * An utterance to be handed off to the AlertQueue, which manages the order of accessibility alerts
 * read by a screen reader.
 *
 * An utterance to be provided to the AlertQueue. An utterance can be one of IAlertable.
 *
 * A single Utterance can be added to the utteranceQueue multiple times. This may be so that a
 * number of alerts associated with the utterance get read in order (see alert in options). Or it
 * may be that changes are being alerted rapidly from the same source. An Utterance is considered
 * "unstable" if it is being added rapidly to the utteranceQueue. By default, utterances are only
 * announced when they are "stable", and stop getting added to the queue. This will prevent
 * a large number of alerts from the same interaction from spamming the user. See related options alertStableDelay,
 * and alertMaximumDelay.
 *
 * @author Jesse Greenberg
 * @author Michael Kauzmann (PhET Interactive Simulations)
 */

import DerivedProperty from '../../axon/js/DerivedProperty.js';
import DynamicProperty from '../../axon/js/DynamicProperty.js';
import NumberProperty from '../../axon/js/NumberProperty.js';
import optionize from '../../phet-core/js/optionize.js';
import IOType from '../../tandem/js/types/IOType.js';
import StringIO from '../../tandem/js/types/StringIO.js';
import responseCollector from './responseCollector.js';
import ResponsePacket, { ResolvedResponse } from './ResponsePacket.js';
import utteranceQueueNamespace from './utteranceQueueNamespace.js';
import IProperty from '../../axon/js/IProperty.js';
import NullableIO from '../../tandem/js/types/NullableIO.js';
import NumberIO from '../../tandem/js/types/NumberIO.js';
import OrIO from '../../tandem/js/types/OrIO.js';
import TinyProperty from '../../axon/js/TinyProperty.js';
import Property from '../../axon/js/Property.js';
import IReadOnlyProperty from '../../axon/js/IReadOnlyProperty.js';

// constants
const DEFAULT_PRIORITY = 1;

export type IAlertable = ResolvedResponse | ( () => string ) | ResponsePacket | Utterance;

type AlertableNoUtterance = Exclude<IAlertable, Utterance>

type SerializedUtterance = {
  alert: ResolvedResponse;
}

let globalIdCounter = 1;

export type UtteranceOptions = {

  // The content of the alert that this Utterance is wrapping.
  alert?: AlertableNoUtterance;

  // List of Properties that must all be true in order for the Utterance to be announced by the Announcer. See
  // setCanAnnounceProperties() for more information.
  canAnnounceProperties?: IProperty<boolean>[];

  // if predicate returns false, the alert content associated
  // with this utterance will not be announced by the utterance-queue. Announcers also optionally have the ability
  // to respect this predicate before they finally alert the Utterance. This can be helpful if utterances sit and
  // wait in the announcer before being alerted.
  predicate?: () => boolean;

  // in ms, how long to wait before the utterance is considered "stable" and stops being
  // added to the queue, at which point it will be spoken. Default value chosen because
  // it sounds nice in most usages of Utterance with alertStableDelay. If you want to hear the utterance as fast
  // as possible, reduce this delay to 0. See https://github.com/phetsims/scenery-phet/issues/491
  alertStableDelay?: number;

  // in ms, the maximum amount of time that should
  // pass before this alert should be spoken, even if the utterance is rapidly added to the queue
  // and is not quite "stable"
  alertMaximumDelay?: number;

  // Options specific to the Announcer of the Utterance. See supported options in your specific Announcer's
  // announce() function (for example AriaLiveAnnouncer.announce())
  announcerOptions?: Record<string, unknown>;

  // {number} - Used to determine which utterance might interrupt another utterance. Please only use priority statics
  // on Utterance when setting this value like Utterance.MEDIUM_PRIORITY.
  // Any utterance (1) with a higher priority than another utterance (2) will behave as such:
  // - (1) will interrupt (2) when (2) is currently being spoken, and (1) is announced by the voicingManager. In this
  //       case, (2) is interrupted, and never finished.
  // - (1) will continue speaking if (1) was speaking, and (2) is announced by the voicingManager. In this case (2)
  //       will be spoken when (1) is done
  priority?: number;
}

class Utterance {
  id: number;
  private _alert: AlertableNoUtterance;

  // List of Properties that must all be true in order for the Utterance to be announced by the Announcer.
  private _canAnnounceProperties: IProperty<boolean>[];

  // A Property for the DynamicProperty. The value of this Property is the DerivedProperty.and of all
  // canAnnounceProperties. The benefit of using a DynamicProperty is that dependency Properties of the
  // implementation can change (new DerivedProperty in setCanAnnounceProperties) but the listeners will remain
  // unaffected on the canAnnounceProperty.
  private readonly canAnnounceImplementationProperty: Property<IReadOnlyProperty<boolean>>;

  // If the value of this Property is false, this Utterance will never be announced by an Announcer. See
  // documentation for canAnnounceImplementationProperty for implementation details and why we use a DynamicProperty.
  public readonly canAnnounceProperty: DynamicProperty<boolean, boolean, IReadOnlyProperty<boolean>>;

  // (utterance-queue-internal)
  readonly predicate: () => boolean;

  // (utterance-queue-internal)
  alertStableDelay: number;

  // (utterance-queue-internal)
  alertMaximumDelay: number;

  // (utterance-queue-internal)
  announcerOptions: Record<string, unknown>;

  // observable for the priority, can be set to change the priority of this Utterance
  // while it is still in the UtteranceQueue. See options documentation for behavior of priority.
  priorityProperty: IProperty<number>;

  // the previous value of the resolved "alert". See getAlertText()
  previousAlertText: ResolvedResponse;

  constructor( providedOptions?: UtteranceOptions ) {

    const options = optionize<UtteranceOptions>()( {
      alert: null,
      predicate: function() { return true; },
      canAnnounceProperties: [],
      alertStableDelay: 200,
      alertMaximumDelay: Number.MAX_VALUE,
      announcerOptions: {},
      priority: DEFAULT_PRIORITY
    }, providedOptions );

    this.id = globalIdCounter++;

    this._alert = options.alert;

    this.predicate = options.predicate;

    this._canAnnounceProperties = [];
    this.canAnnounceImplementationProperty = new Property<IReadOnlyProperty<boolean>>( new TinyProperty( false ) );
    this.canAnnounceProperty = new DynamicProperty<boolean, boolean, IReadOnlyProperty<boolean>>( this.canAnnounceImplementationProperty );
    this.setCanAnnounceProperties( options.canAnnounceProperties );

    this.alertStableDelay = options.alertStableDelay;

    this.alertMaximumDelay = options.alertMaximumDelay;

    this.announcerOptions = options.announcerOptions;

    this.priorityProperty = new NumberProperty( options.priority );

    this.previousAlertText = null;
  }

  /**
   * @param alert
   * @param respectResponseCollectorProperties - if false, then do not listen to the value of responseCollector
   *                                              for creating the ResponsePacket conglomerate (just combine all available).
   */
  private static getAlertStringFromResponsePacket( alert: ResponsePacket, respectResponseCollectorProperties: boolean ): string {

    const responsePacketOptions = alert.serialize();

    if ( !respectResponseCollectorProperties ) {
      responsePacketOptions.ignoreProperties = true;
    }
    return responseCollector.collectResponses( responsePacketOptions );
  }

  /**
   * Get the string to alert, with no side effects
   * @param respectResponseCollectorProperties=false - if false, then do not listen to the value of responseCollector
   *                                              for creating the ResponsePacket conglomerate (just combine all that are supplied).
   */
  getAlertText( respectResponseCollectorProperties = false ): ResolvedResponse {

    const alert = Utterance.alertableToText( this._alert, respectResponseCollectorProperties );

    this.previousAlertText = alert;
    return alert;
  }

  getAlert(): AlertableNoUtterance {
    return this._alert;
  }

  get alert(): AlertableNoUtterance {return this.getAlert(); }

  set alert( alert: AlertableNoUtterance ) { this.setAlert( alert ); }

  setAlert( alert: AlertableNoUtterance ): void {
    this._alert = alert;
  }

  /**
   * Set the alertStableDelay time, see alertStableDelay option for more information.
   *
   * BEWARE! Why does the delay time need to be changed during the lifetime of an Utterance? It did for
   * https://github.com/phetsims/gravity-force-lab-basics/issues/146, but does it for you? Be sure there is good
   * reason changing this value.
   */
  setAlertStableDelay( delay: number ): void {
    this.alertStableDelay = delay;
  }

  toString(): string {
    return `Utterance_${this.id}#${this.getAlertText()}`;
  }

  /**
   * @returns {{alert: string}}
   */
  toStateObject(): SerializedUtterance {
    return {
      alert: NullableIO( OrIO( [ StringIO, NumberIO ] ) ).toStateObject( this.getAlertText() )
    };
  }

  reset(): void {
    this.previousAlertText = null;
  }

  /**
   * Set the Properties controlling whether this Utterance can announce. All Properties must be
   * true for the alert content of this Utterance to be announced. These Properties are used in the implementation
   * of this.canAnnounceProperty. Setting new canAnnounceProperties has no impact on the listeners added to
   * this.canAnnounceProperty.
   */
  public setCanAnnounceProperties( canAnnounceProperties: IProperty<boolean>[] ): void {
    if ( this.canAnnounceImplementationProperty.value ) {
      this.canAnnounceImplementationProperty.value.dispose();
    }

    // If no canAnnounceProperties provided, use a dummy Property that will always allow this Utterance to announce.
    const dependencyProperties = canAnnounceProperties.length === 0 ? [ new TinyProperty( true ) ] : canAnnounceProperties;

    const canSpeakProperty = DerivedProperty.and( dependencyProperties );
    this.canAnnounceImplementationProperty.value = canSpeakProperty;

    this._canAnnounceProperties = canAnnounceProperties;
  }

  set canAnnounceProperties( canAnnounceProperties: IProperty<boolean>[] ) { this.setCanAnnounceProperties( canAnnounceProperties ); }

  get canAnnounceProperties() { return this.getCanAnnounceProperties(); }

  /**
   * Get the Properties that control whether the alert content for this Utterance can be announced.
   * All must be true for the announcement to occur.
   */
  public getCanAnnounceProperties(): IProperty<boolean>[] {
    return this._canAnnounceProperties.slice( 0 ); // defensive copy
  }

  /**
   * Make eligible for garbage collection.
   */
  public dispose(): void {
    this.canAnnounceImplementationProperty.dispose();
    this.canAnnounceProperty.dispose();

    this.priorityProperty.dispose();

    this._canAnnounceProperties = [];
  }

  /**
   * @param alertable
   * @param respectResponseCollectorProperties=false - if false, then do not listen to the value of responseCollector
   *                                              for creating the ResponsePacket conglomerate (just combine all that are supplied).
   */
  static alertableToText( alertable: IAlertable, respectResponseCollectorProperties = false ): ResolvedResponse {
    let alert: ResolvedResponse;

    if ( typeof alertable === 'function' ) {
      alert = alertable();
    }

    // Support if ResponsePacket is inside an array alert
    else if ( alertable instanceof ResponsePacket ) {
      alert = Utterance.getAlertStringFromResponsePacket( alertable, respectResponseCollectorProperties );
    }
    else if ( alertable instanceof Utterance ) {
      return alertable.getAlertText( respectResponseCollectorProperties );
    }
    else {
      alert = alertable;
    }
    return alert;
  }

  // Priority levels that can be used by Utterances providing the `announcerOptions.priority` option.
  static TOP_PRIORITY = 10;
  static HIGH_PRIORITY = 5;
  static MEDIUM_PRIORITY = 2;
  static DEFAULT_PRIORITY = DEFAULT_PRIORITY;
  static LOW_PRIORITY = 0;

  static UtteranceIO = new IOType( 'UtteranceIO', {
    valueType: Utterance,
    documentation: 'Announces text to a specific browser technology (like aria-live or web speech)',
    toStateObject: ( utterance: Utterance ) => utterance.toStateObject(),
    stateSchema: {
      alert: NullableIO( OrIO( [ StringIO, NumberIO ] ) )
    }
  } );
}

utteranceQueueNamespace.register( 'Utterance', Utterance );
export default Utterance;