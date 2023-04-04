// Copyright 2022-2023, University of Colorado Boulder

/**
 * An utterance to be handed off to the AlertQueue, which manages the order of accessibility alerts
 * read by a screen reader.
 *
 * An utterance to be provided to the AlertQueue. An utterance can be one of TAlertable.
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
import ReadOnlyProperty from '../../axon/js/ReadOnlyProperty.js';
import TinyProperty from '../../axon/js/TinyProperty.js';
import DynamicProperty, { DynamicPropertyOptions } from '../../axon/js/DynamicProperty.js';
import NumberProperty from '../../axon/js/NumberProperty.js';
import optionize from '../../phet-core/js/optionize.js';
import IOType from '../../tandem/js/types/IOType.js';
import StringIO from '../../tandem/js/types/StringIO.js';
import responseCollector from './responseCollector.js';
import ResponsePacket, { ResolvedResponse } from './ResponsePacket.js';
import utteranceQueueNamespace from './utteranceQueueNamespace.js';
import TProperty from '../../axon/js/TProperty.js';
import NullableIO from '../../tandem/js/types/NullableIO.js';
import NumberIO from '../../tandem/js/types/NumberIO.js';
import OrIO from '../../tandem/js/types/OrIO.js';
import Property from '../../axon/js/Property.js';
import TReadOnlyProperty from '../../axon/js/TReadOnlyProperty.js';
import Disposable from '../../axon/js/Disposable.js';

// constants
const DEFAULT_PRIORITY = 1;

export type TAlertable = ResolvedResponse | ( () => string ) | TReadOnlyProperty<string> | ResponsePacket | Utterance;

type AlertableNoUtterance = Exclude<TAlertable, Utterance>;

type SerializedUtterance = {
  alert: ResolvedResponse;
};

// The names of Properties that can be accessed on Utterance that are AnnouncingControlProperties for specific Announcing
// features.
export type FeatureSpecificAnnouncingControlProperty = 'descriptionCanAnnounceProperty' | 'voicingCanAnnounceProperty';

type FeatureSpecificAnnouncingControlPropertySupported = {
  [Property in FeatureSpecificAnnouncingControlProperty]: AnnouncingControlProperty
};

let globalIdCounter = 1;

type SelfOptions = {

  // The content of the alert that this Utterance is wrapping.
  alert?: AlertableNoUtterance;

  // List of Properties that must all be true in order for the Utterance to be announced by the Announcer. See
  // setCanAnnounceProperties() for more information.
  canAnnounceProperties?: TReadOnlyProperty<boolean>[];

  // List of Properties that must all be true in order for the Utterance to be announced to the Interactive Description
  // feature of PhET Simulations. canAnnounceProperties also apply (and so must all be true) to announce with this
  // specific feature.
  descriptionCanAnnounceProperties?: TReadOnlyProperty<boolean>[];

  // List of Properties that must all be true in order for the Utterance to be announced to the Voicing
  // feature of PhET Simulations. canAnnounceProperties also apply (and so must all be true) to announce with this
  // specific feature.
  voicingCanAnnounceProperties?: TReadOnlyProperty<boolean>[];

  // if predicate returns false, the alert content associated
  // with this utterance will not be announced by the utterance-queue. Announcers also optionally have the ability
  // to respect this predicate before they finally alert the Utterance. This can be helpful if utterances sit and
  // wait in the announcer before being alerted. If the predicate fails there is no retry. The utterance will be
  // removed from the queue without announcing.
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
  // - (1) will continue speaking if (1) was speaking, and (2) is added to the UtteranceQueue. In this case (2)
  //       will be spoken when (1) is done. In this case (2) will remain in the queue while waiting for (1) to finish.
  priority?: number;
};

export type UtteranceOptions = SelfOptions;

class Utterance extends Disposable implements FeatureSpecificAnnouncingControlPropertySupported {
  private readonly id: number;
  private _alert: AlertableNoUtterance;

  // If the value of this Property is false, this Utterance will never be announced by an Announcer. See
  // documentation for canAnnounceImplementationProperty for implementation details and why we use a DynamicProperty.
  public readonly canAnnounceProperty: AnnouncingControlProperty;

  // If the value of this Property is false, this Utterance will never be announced by AriaLiveAnnouncer.
  public readonly descriptionCanAnnounceProperty: AnnouncingControlProperty;

  // If the value of this Property is false, this Utterance will never be announced by SpeechSynthesisAnnouncer.
  public readonly voicingCanAnnounceProperty: AnnouncingControlProperty;

  // (utterance-queue-internal)
  public readonly predicate: () => boolean;

  // (utterance-queue-internal)
  public alertStableDelay: number;

  // (utterance-queue-internal)
  public alertMaximumDelay: number;

  // (utterance-queue-internal)
  public announcerOptions: Record<string, unknown>;

  // observable for the priority, can be set to change the priority of this Utterance
  // while it is still in the UtteranceQueue. See options documentation for behavior of priority.
  public priorityProperty: TProperty<number>;

  // the previous value of the resolved "alert". See getAlertText().
  private previousAlertText: ResolvedResponse;

  public constructor( providedOptions?: UtteranceOptions ) {

    const options = optionize<UtteranceOptions, SelfOptions>()( {
      alert: null,
      predicate: function() { return true; },
      canAnnounceProperties: [],
      descriptionCanAnnounceProperties: [],
      voicingCanAnnounceProperties: [],
      alertStableDelay: 200,
      alertMaximumDelay: Number.MAX_VALUE,
      announcerOptions: {},
      priority: DEFAULT_PRIORITY
    }, providedOptions );

    super();

    this.id = globalIdCounter++;

    this._alert = options.alert;

    this.predicate = options.predicate;

    this.canAnnounceProperty = new AnnouncingControlProperty( {
      dependentProperties: options.canAnnounceProperties
    } );
    this.descriptionCanAnnounceProperty = new AnnouncingControlProperty( {
      dependentProperties: options.descriptionCanAnnounceProperties
    } );
    this.voicingCanAnnounceProperty = new AnnouncingControlProperty( {
      dependentProperties: options.voicingCanAnnounceProperties

    } );
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
   * Get the string to alert. This function has potential to run a function to generate the string. Use this with caution.
   * Most often UtteranceQueue should be the only spot calling this.
   * @param respectResponseCollectorProperties=false - if false, then do not listen to the value of responseCollector
   *                                              for creating the ResponsePacket conglomerate (just combine all that are supplied).
   */
  public getAlertText( respectResponseCollectorProperties = false ): ResolvedResponse {

    const alert = Utterance.alertableToText( this._alert, respectResponseCollectorProperties );

    this.previousAlertText = alert;
    return alert;
  }

  public getAlert(): AlertableNoUtterance {
    return this._alert;
  }

  public get alert(): AlertableNoUtterance {return this.getAlert(); }

  public set alert( alert: AlertableNoUtterance ) { this.setAlert( alert ); }

  public setAlert( alert: AlertableNoUtterance ): void {
    this._alert = alert;
  }

  /**
   * Set the alertStableDelay time, see alertStableDelay option for more information.
   *
   * BEWARE! Why does the delay time need to be changed during the lifetime of an Utterance? It did for
   * https://github.com/phetsims/gravity-force-lab-basics/issues/146, but does it for you? Be sure there is good
   * reason changing this value.
   */
  public setAlertStableDelay( delay: number ): void {
    this.alertStableDelay = delay;
  }

  public override toString(): string {
    return `Utterance_${this.id}#${this.getAlertText()}`;
  }

  public toStateObject(): SerializedUtterance {
    return {
      alert: NullableIO( OrIO( [ StringIO, NumberIO ] ) ).toStateObject( this.getAlertText() )
    };
  }

  public reset(): void {
    this.previousAlertText = null;
  }

  /**
   * Set the Properties controlling whether this Utterance can announce. All Properties must be
   * true for the alert content of this Utterance to be announced. These Properties are used in the implementation
   * of this.canAnnounceProperty. Setting new canAnnounceProperties has no impact on the listeners added to
   * this.canAnnounceProperty.
   */
  public setCanAnnounceProperties( canAnnounceProperties: TReadOnlyProperty<boolean>[] ): void {
    this.canAnnounceProperty.setDependentProperties( canAnnounceProperties );
  }

  public set canAnnounceProperties( canAnnounceProperties: TReadOnlyProperty<boolean>[] ) {
    this.setCanAnnounceProperties( canAnnounceProperties );
  }

  public get canAnnounceProperties(): TReadOnlyProperty<boolean>[] { return this.getCanAnnounceProperties(); }

  /**
   * Get the Properties that control whether the alert content for this Utterance can be announced.
   * All must be true for the announcement to occur.
   */
  public getCanAnnounceProperties(): TReadOnlyProperty<boolean>[] {
    return this.canAnnounceProperty.getDependentProperties();
  }

  /**
   * Set the Properties controlling whether this Utterance can announce to AriaLiveAnnouncer. All Properties must be
   * true for the alert content of this Utterance to be announced. These Properties are used in the implementation
   * of this.descriptionCanAnnounceProperty. Setting new descriptionCanAnnounceProperties has no impact on the
   * listeners added to this.descriptionCanAnnounceProperty. To announce to AriaLiveAnnouncer, this.canAnnounceProperty
   * must also be true
   */
  public setDescriptionCanAnnounceProperties( descriptionCanAnnounceProperties: TReadOnlyProperty<boolean>[] ): void {
    this.descriptionCanAnnounceProperty.setDependentProperties( descriptionCanAnnounceProperties );
  }

  public set descriptionCanAnnounceProperties( descriptionCanAnnounceProperties: TReadOnlyProperty<boolean>[] ) {
    this.setDescriptionCanAnnounceProperties( descriptionCanAnnounceProperties );
  }

  public get descriptionCanAnnounceProperties(): TReadOnlyProperty<boolean>[] { return this.getDescriptionCanAnnounceProperties(); }

  /**
   * Get the Properties that control whether the alert content for this Utterance can be announced.
   * All must be true for the announcement to occur.
   */
  public getDescriptionCanAnnounceProperties(): TReadOnlyProperty<boolean>[] {
    return this.descriptionCanAnnounceProperty.getDependentProperties();
  }

  /**
   * Set the Properties controlling whether this Utterance can announce to SpeechSynthesisAnnouncer. All Properties
   * must be true for the alert content of this Utterance to be announced. These Properties are used in the
   * implementation of this.voicingCanAnnounceProperty. Setting new voicingCanAnnounceProperties has no impact
   * on the listeners added to this.voicingCanAnnounceProperty. To announce to SpeechSynthesisAnnouncer,
   * this.canAnnounceProperty must also be true.
   */
  public setVoicingCanAnnounceProperties( voicingCanAnnounceProperties: TReadOnlyProperty<boolean>[] ): void {
    this.voicingCanAnnounceProperty.setDependentProperties( voicingCanAnnounceProperties );
  }

  public set voicingCanAnnounceProperties( voicingCanAnnounceProperties: TReadOnlyProperty<boolean>[] ) {
    this.setVoicingCanAnnounceProperties( voicingCanAnnounceProperties );
  }

  public get voicingCanAnnounceProperties(): TReadOnlyProperty<boolean>[] { return this.getVoicingCanAnnounceProperties(); }

  /**
   * Get the Properties that control whether the alert content for this Utterance can be announced.
   * All must be true for the announcement to occur.
   */
  public getVoicingCanAnnounceProperties(): TReadOnlyProperty<boolean>[] {
    return this.voicingCanAnnounceProperty.getDependentProperties();
  }

  /**
   * Make eligible for garbage collection.
   */
  public override dispose(): void {
    this.canAnnounceProperty.dispose();
    this.descriptionCanAnnounceProperty.dispose();
    this.voicingCanAnnounceProperty.dispose();

    this.priorityProperty.dispose();

    super.dispose();
  }

  /**
   * @param alertable
   * @param respectResponseCollectorProperties=false - if false, then do not listen to the value of responseCollector
   *                                              for creating the ResponsePacket conglomerate (just combine all that are supplied).
   */
  public static alertableToText( alertable: TAlertable, respectResponseCollectorProperties = false ): ResolvedResponse {
    let alert: ResolvedResponse;

    if ( typeof alertable === 'function' ) {
      alert = alertable();
    }
    else if ( alertable instanceof ResponsePacket ) {
      alert = Utterance.getAlertStringFromResponsePacket( alertable, respectResponseCollectorProperties );
    }
    else if ( alertable instanceof Utterance ) {
      return alertable.getAlertText( respectResponseCollectorProperties );
    }
    else if ( alertable instanceof ReadOnlyProperty || alertable instanceof TinyProperty ) {
      alert = alertable.value;
    }
    else {

      // Nothing to process from the TAlertable, it is raw content
      alert = alertable as ResolvedResponse;
    }
    return alert;
  }

  // Priority levels that can be used by Utterances providing the `announcerOptions.priority` option.
  public static readonly TOP_PRIORITY = 10;
  public static readonly HIGH_PRIORITY = 5;
  public static readonly MEDIUM_PRIORITY = 2;
  public static readonly DEFAULT_PRIORITY = DEFAULT_PRIORITY;
  public static readonly LOW_PRIORITY = 0;

  public static readonly UtteranceIO = new IOType( 'UtteranceIO', {
    valueType: Utterance,
    documentation: 'Announces text to a specific browser technology (like aria-live or web speech)',
    toStateObject: ( utterance: Utterance ) => utterance.toStateObject(),
    stateSchema: {
      alert: NullableIO( OrIO( [ StringIO, NumberIO ] ) )
    }
  } );
}

type AnnouncingControlPropertySelfOptions = {
  dependentProperties?: TReadOnlyProperty<boolean>[];
};

type AnnouncingControlPropertyParentOptions = DynamicPropertyOptions<boolean, boolean, TReadOnlyProperty<boolean>>;
type AnnouncingControlPropertyOptions = AnnouncingControlPropertySelfOptions & AnnouncingControlPropertyParentOptions;

class AnnouncingControlProperty extends DynamicProperty<boolean, boolean, TReadOnlyProperty<boolean>> {

  // List of Properties that must all be true in order for the Utterance to be announced by the Announcer.
  private _dependentProperties: TReadOnlyProperty<boolean>[];

  // A Property for the DynamicProperty. The value of this Property is the DerivedProperty.and of all
  // canAnnounceProperties. The benefit of using a DynamicProperty is that dependency Properties of the
  // implementation can change (new DerivedProperty in setDependentProperties) but the listeners will remain
  // unaffected on the canAnnounceProperty.
  private readonly implementationProperty: Property<TReadOnlyProperty<boolean>>;

  public constructor( providedOptions?: AnnouncingControlPropertyOptions ) {

    const options = optionize<AnnouncingControlPropertyOptions, AnnouncingControlPropertySelfOptions, AnnouncingControlPropertyParentOptions>()( {
      dependentProperties: []
    }, providedOptions );

    const implementationProperty = new Property<TReadOnlyProperty<boolean>>( new TinyProperty( false ) );

    super( implementationProperty );

    this._dependentProperties = [];
    this.implementationProperty = implementationProperty;
    this.setDependentProperties( options.dependentProperties );
  }

  /**
   * Set the Properties controlling this Property's value. All Properties must be true for this Property to be true.
   */
  public setDependentProperties( dependentProperties: TReadOnlyProperty<boolean>[] ): void {
    if ( this.implementationProperty.value ) {
      this.implementationProperty.value.dispose();
    }

    // If no dependentProperties provided, use a dummy Property that will always allow this Utterance to announce.
    const dependencyProperties = dependentProperties.length === 0 ? [ new TinyProperty( true ) ] : dependentProperties;

    this.implementationProperty.value = DerivedProperty.and( dependencyProperties );

    this._dependentProperties = dependentProperties;
  }


  public set dependentProperties( dependentProperties: TReadOnlyProperty<boolean>[] ) { this.setDependentProperties( dependentProperties ); }

  public get dependentProperties() { return this.getDependentProperties(); }

  /**
   * Get the Properties that control whether the alert content for this Utterance can be announced.
   * All must be true for the announcement to occur.
   */
  public getDependentProperties(): TReadOnlyProperty<boolean>[] {
    return this._dependentProperties.slice( 0 ); // defensive copy
  }

  public override dispose(): void {
    this.implementationProperty.dispose();
    this._dependentProperties = [];
    super.dispose();
  }
}

utteranceQueueNamespace.register( 'Utterance', Utterance );
export default Utterance;