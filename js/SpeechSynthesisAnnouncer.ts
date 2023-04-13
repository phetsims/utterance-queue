// Copyright 2022-2023, University of Colorado Boulder

/**
 * Uses the Web Speech API to produce speech from the browser. There is no speech output until the SpeechSynthesisAnnouncer has
 * been initialized. Supported voices will depend on platform. For each voice, you can customize the rate and pitch.
 *
 * Only one SpeechSynthesisAnnouncer can be used at a time. This class uses a global instance of window.speechSynthesis
 * and assumes it has full control over it. This is not a singleton because subclasses may extend this for specific
 * uses. For example, PhET has one subclass specific to its Voicing feature and another specific to
 * custom speech synthesis in number-suite-common sims.
 *
 * A note about PhET-iO instrumentation:
 * Properties are instrumented for PhET-iO to provide a record of learners that may have used this feature (and how). All
 * Properties should be phetioState:false so the values are not overwritten when a customized state is loaded.
 * Properties are not phetioReadonly so that clients can overwrite the values using the PhET-iO API and studio.
 *
 * @author Jesse Greenberg
 */

import BooleanProperty from '../../axon/js/BooleanProperty.js';
import DerivedProperty from '../../axon/js/DerivedProperty.js';
import Emitter from '../../axon/js/Emitter.js';
import EnabledComponent from '../../axon/js/EnabledComponent.js';
import TProperty from '../../axon/js/TProperty.js';
import TReadOnlyProperty from '../../axon/js/TReadOnlyProperty.js';
import NumberProperty from '../../axon/js/NumberProperty.js';
import Property from '../../axon/js/Property.js';
import Range from '../../dot/js/Range.js';
import optionize, { optionize3, OptionizeDefaults } from '../../phet-core/js/optionize.js';
import stripEmbeddingMarks from '../../phet-core/js/stripEmbeddingMarks.js';
import Announcer, { AnnouncerOptions } from '../../utterance-queue/js/Announcer.js';
import Utterance from '../../utterance-queue/js/Utterance.js';
import SpeechSynthesisParentPolyfill from './SpeechSynthesisParentPolyfill.js';
import utteranceQueueNamespace from './utteranceQueueNamespace.js';
import { ResolvedResponse } from './ResponsePacket.js';
import stepTimer from '../../axon/js/stepTimer.js';
import platform from '../../phet-core/js/platform.js';
import Multilink from '../../axon/js/Multilink.js';
import TEmitter from '../../axon/js/TEmitter.js';
import Tandem from '../../tandem/js/Tandem.js';
import IOType from '../../tandem/js/types/IOType.js';
import NullableIO from '../../tandem/js/types/NullableIO.js';
import validate from '../../axon/js/validate.js';
import Validation from '../../axon/js/Validation.js';
import { Locale } from '../../joist/js/i18n/localeProperty.js';

// If a polyfill for SpeechSynthesis is requested, try to initialize it here before SpeechSynthesis usages. For
// now this is a PhET specific feature, available by query parameter in initialize-globals. QueryStringMachine
// cannot be used for this, see https://github.com/phetsims/scenery/issues/1366
if ( window.phet && phet.chipper && phet.chipper.queryParameters && phet.chipper.queryParameters.speechSynthesisFromParent ) {
  SpeechSynthesisParentPolyfill.initialize();
}

// In ms, how frequently we will use SpeechSynthesis to keep the feature active. After long intervals without
// using SpeechSynthesis Chromebooks will take a long time to produce the next speech. Presumably it is disabling
// the feature as an optimization. But this workaround gets around it and keeps speech fast.
const ENGINE_WAKE_INTERVAL = 5000;

// In ms, how long to wait before we consider the SpeechSynthesis engine as having failed to speak a requested
// utterance. ChromeOS and Safari in particular may simply fail to speak. If the amount of time between our speak()
// request and the time we receive the `start` event is too long then we know there was a failure and we can try
// to handle accordingly. Length is somewhat arbitrary, but 5 seconds felt OK and seemed to work well to recover from
// this error case.
const PENDING_UTTERANCE_DELAY = 5000;

// In Windows Chromium, long utterances with the Google voices simply stop after 15 seconds and we never get end or
// cancel events. The workaround proposed in https://bugs.chromium.org/p/chromium/issues/detail?id=679437 is
// to pause/resume the utterance at an interval.
const PAUSE_RESUME_WORKAROUND_INTERVAL = 10000;

// In ms. In Safari, the `start` and `end` listener do not fire consistently, especially after interruption
// with cancel. But speaking behind a timeout/delay improves the behavior significantly. Timeout of 125 ms was
// determined with testing to be a good value to use. Values less than 125 broke the workaround, while larger
// values feel too sluggish. See https://github.com/phetsims/john-travoltage/issues/435
// Beware that UtteranceQueueTests use this value too. Don't change without checking those tests.
const VOICING_UTTERANCE_INTERVAL = 125;

// A list of "novelty" voices made available by the operating system...for some reason. There is nothing special about
// these novelty SpeechSynthesisVoices to exclude them. So having a list to exclude by name and maintining over time
// is the best we can do.
const NOVELTY_VOICES = [
  'Albert',
  'Bad News',
  'Bahh',
  'Bells',
  'Boing',
  'Bubbles',
  'Cellos',
  'Good News',
  'Jester',
  'Organ',
  'Superstar',
  'Trinoids',
  'Whisper',
  'Wobble',
  'Zarvox',

  // not technically "novelty" but still sound too bad and would be distracting to users, see
  // https://github.com/phetsims/utterance-queue/issues/93#issuecomment-1303901484
  'Flo',
  'Grandma',
  'Grandpa',
  'Junior'
];

// Only one instance of SpeechSynthesisAnnouncer can be initialized, see top level type documentation.
let initializeCount = 0;

type SpeechSynthesisAnnounceOptions = {
  cancelSelf?: boolean;
  cancelOther?: boolean;
  voice?: SpeechSynthesisVoice | null;
};

// The SpeechSynthesisVoice.lang property has a schema that is different from our locale (see https://developer.mozilla.org/en-US/docs/Web/API/SpeechSynthesisVoice/lang)
// As a result, manually map a couple important values back to our own supported locales, see https://github.com/phetsims/number-play/issues/230.
// You can test that this map is working with something like `'en-GB': 'es'`
const voiceLangToSupportedLocale: Record<string, Locale> = {
  cmn: 'zh_CN',
  yue: 'zh_HK',
  'yue-HK': 'zh_HK',
  yue_HK: 'zh_HK',
  'fil-PH': 'tl', // ISO 639-1 does not support filipino, so this is better than nothing (since it has translation support)
  fil_PH: 'tl'
};

const UTTERANCE_OPTION_DEFAULTS: OptionizeDefaults<SpeechSynthesisAnnounceOptions> = {

  // If true and this Utterance is currently being spoken by the speech synth, announcing it
  // to the queue again will immediately cancel the synth and new content will be
  // spoken. Otherwise, new content for this utterance will be spoken whenever the old
  // content has finished speaking. Used when adding the Utterance to be spoken.
  cancelSelf: true,

  // Only applies to two Utterances with the same priority. If true and another Utterance is currently
  // being spoken by the speech synth (or queued by SpeechSynthesisAnnouncer), announcing this Utterance will immediately cancel
  // the other content being spoken by the synth. Otherwise, content for the new utterance will be spoken as soon as
  // the browser finishes speaking the utterances in front of it in line. Used when adding the Utterance to be spoken.
  cancelOther: true,

  // Provide a specific SpeechSynthesisVoice for only this Utterance, or if null use the Announcer's general
  // voiceProperty value. Used when speaking the Utterance.
  voice: null
};

// Options to the initialize function
export type SpeechSynthesisInitializeOptions = {
  speechAllowedProperty?: TReadOnlyProperty<boolean>;
};

type SelfOptions = {

  // Switch to true to enable debugging features (like logging)
  debug?: boolean;
};

export type SpeechSynthesisAnnouncerOptions = SelfOptions & AnnouncerOptions;

class SpeechSynthesisAnnouncer extends Announcer {
  public readonly voiceProperty: Property<null | SpeechSynthesisVoice>;

  // controls the speaking rate of Web Speech
  public readonly voiceRateProperty: NumberProperty;

  // controls the pitch of the synth
  public readonly voicePitchProperty: NumberProperty;

  // Controls volume of the synth. Intended for use with unit tests only!!
  private readonly voiceVolumeProperty: NumberProperty;

  // In ms, how long to go before "waking the SpeechSynthesis" engine to keep speech
  // fast on Chromebooks, see documentation around ENGINE_WAKE_INTERVAL.
  private timeSinceWakingEngine: number;

  // In ms, how long since we have applied the "pause/resume" workaround for long utterances in Chromium. Very
  // long SpeechSynthesisUtterances (longer than 15 seconds) get cut on Chromium and we never get "end" or "cancel"
  // events due to a platform bug, see https://bugs.chromium.org/p/chromium/issues/detail?id=679437.
  private timeSincePauseResume: number;

  // In ms, how long it has been since we requested speech of a new utterance and when
  // the synth has successfully started speaking it. It is possible that the synth will fail to speak so if
  // this timer gets too high we handle the failure case.
  private timeSincePendingUtterance: number;

  // Amount of time in ms to wait between speaking SpeechSynthesisUtterances, see
  // VOICING_UTTERANCE_INTERVAL for details about why this is necessary. Initialized to the interval value
  // so that we can speak instantly the first time.
  private timeSinceUtteranceEnd: number;

  // emits events when the speaker starts/stops speaking, with the Utterance that is
  // either starting or stopping
  public readonly startSpeakingEmitter: TEmitter<[ ResolvedResponse, Utterance ]>;
  public readonly endSpeakingEmitter: TEmitter<[ ResolvedResponse, Utterance ]>;

  // To get around multiple inheritance issues, create enabledProperty via composition instead, then create
  // a reference on this component for the enabledProperty
  private enabledComponentImplementation: EnabledComponent;
  public readonly enabledProperty: TProperty<boolean>;

  // Controls whether Voicing is enabled in a "main window" area of the application.
  // This supports the ability to disable Voicing for the important screen content of your application while keeping
  // Voicing for surrounding UI components enabled (for example).
  public readonly mainWindowVoicingEnabledProperty: Property<boolean>;

  // Property that indicates that the Voicing feature is enabled for all areas of the application.
  public voicingFullyEnabledProperty: TReadOnlyProperty<boolean>;

  // Indicates whether speech is fully enabled AND speech is allowed, as specified
  // by the Property provided in initialize(). See speechAllowedProperty of initialize(). In order for this Property
  // to be true, speechAllowedProperty, enabledProperty, and mainWindowVoicingEnabledProperty must all be true.
  // Initialized in the constructor because we don't have access to all the dependency Properties until initialize.
  // These two variable keep a public, readonly interface. We cannot use a DerivedProperty because it needs to be
  // listened to before its dependencies are created, see https://github.com/phetsims/utterance-queue/issues/72
  public readonly speechAllowedAndFullyEnabledProperty: TReadOnlyProperty<boolean>;
  private readonly _speechAllowedAndFullyEnabledProperty: TProperty<boolean>;

  // synth from Web Speech API that drives speech, defined on initialize
  private synth: null | SpeechSynthesis;

  // possible voices for Web Speech synthesis
  public voicesProperty: TProperty<SpeechSynthesisVoice[]>;

  // Holds a reference to the Utterance that is actively being spoken by the announcer. Note that depending
  // on the platform, there may be a delay between the speak() request and when the synth actually starts speaking.
  // Keeping a reference supports cancelling, priority changes, and cleaning when finished speaking.
  private speakingSpeechSynthesisUtteranceWrapper: SpeechSynthesisUtteranceWrapper | null;

  // is the VoicingManager initialized for use? This is prototypal so it isn't always initialized
  public isInitializedProperty: TProperty<boolean>;

  // Controls whether speech is allowed with synthesis. Null until initialized, and can be set by options to
  // initialize().
  private canSpeakProperty: TReadOnlyProperty<boolean> | null;

  // bound so we can link and unlink to this.canSpeakProperty when the SpeechSynthesisAnnouncer becomes initialized.
  private readonly boundHandleCanSpeakChange: ( canSpeak: boolean ) => void;

  // A listener that will cancel the Utterance that is being announced if its canAnnounceProperty becomes false.
  // Set when this Announcer begins to announce a new Utterance and cleared when the Utterance is finished/cancelled.
  // Bound so that the listener can be added and removed on Utterances without creating many closures.
  private readonly boundHandleCanAnnounceChange: ( canAnnounce: boolean ) => void;

  // Switch to true to enable debugging features (like logging)
  private readonly debug: boolean;

  public constructor( providedOptions?: SpeechSynthesisAnnouncerOptions ) {

    const options = optionize<SpeechSynthesisAnnouncerOptions, SelfOptions, AnnouncerOptions>()( {

      // {boolean} - SpeechSynthesisAnnouncer generally doesn't care about ResponseCollectorProperties,
      // that is more specific to the Voicing feature.
      respectResponseCollectorProperties: false,

      debug: false,

      tandem: Tandem.OPTIONAL
    }, providedOptions );

    super( options );

    this.debug = options.debug;

    this.voiceProperty = new Property<null | SpeechSynthesisVoice>( null, {
      tandem: options.tandem.createTandem( 'voiceProperty' ),
      phetioValueType: NullableIO( SpeechSynthesisVoiceIO ),
      phetioState: false,
      phetioReadOnly: true,
      phetioDocumentation: 'the voice that is currently voicing responses'
    } );
    this.voiceRateProperty = new NumberProperty( 1.0, {
      range: new Range( 0.75, 2 ),
      tandem: options.tandem.createTandem( 'voiceRateProperty' ),
      phetioState: false,
      phetioDocumentation: 'changes the rate of the voicing-feature voice'
    } );
    this.voicePitchProperty = new NumberProperty( 1.0, {
      range: new Range( 0.5, 2 ),
      tandem: options.tandem.createTandem( 'voicePitchProperty' ),
      phetioState: false,
      phetioDocumentation: 'changes the pitch of the voicing-feature voice'
    } );
    this.voiceVolumeProperty = new NumberProperty( 1.0, {
      range: new Range( 0, 1 )
    } );

    // Indicates whether speech using SpeechSynthesis has been requested at least once.
    // The first time speech is requested, it must be done synchronously from user input with absolutely no delay.
    // requestSpeech() generally uses a timeout to workaround browser bugs, but those cannot be used until after the
    // first request for speech.
    this.hasSpoken = false;

    this.timeSinceWakingEngine = 0;
    this.timeSincePauseResume = 0;

    this.timeSincePendingUtterance = 0;

    this.timeSinceUtteranceEnd = VOICING_UTTERANCE_INTERVAL;

    this.startSpeakingEmitter = new Emitter( { parameters: [ { valueType: 'string' }, { valueType: Utterance } ] } );
    this.endSpeakingEmitter = new Emitter( { parameters: [ { valueType: 'string' }, { valueType: Utterance } ] } );

    this.enabledComponentImplementation = new EnabledComponent( {

      // initial value for the enabledProperty, false because speech should not happen until requested by user
      enabled: false,

      tandem: options.tandem,
      enabledPropertyOptions: {
        phetioDocumentation: 'toggles this controller of SpeechSynthesis on and off',
        phetioState: false,
        phetioFeatured: false
      }
    } );

    assert && assert( this.enabledComponentImplementation.enabledProperty.isSettable(), 'enabledProperty must be settable' );
    this.enabledProperty = this.enabledComponentImplementation.enabledProperty;

    this.mainWindowVoicingEnabledProperty = new BooleanProperty( true, {
      tandem: options.tandem.createTandem( 'mainWindowVoicingEnabledProperty' ),
      phetioState: false,
      phetioDocumentation: 'toggles the voicing feature on and off for the simulation screen (not the voicing preferences and toolbar controls)'
    } );

    this.voicingFullyEnabledProperty = DerivedProperty.and( [ this.enabledProperty, this.mainWindowVoicingEnabledProperty ] );

    this._speechAllowedAndFullyEnabledProperty = new BooleanProperty( false );
    this.speechAllowedAndFullyEnabledProperty = this._speechAllowedAndFullyEnabledProperty;

    this.synth = null;
    this.voicesProperty = new Property( [] );

    this.speakingSpeechSynthesisUtteranceWrapper = null;
    this.isInitializedProperty = new BooleanProperty( false );
    this.canSpeakProperty = null;
    this.boundHandleCanSpeakChange = this.handleCanSpeakChange.bind( this );
    this.boundHandleCanAnnounceChange = this.handleCanAnnounceChange.bind( this );

    if ( this.debug ) {
      this.announcementCompleteEmitter.addListener( ( utterance, string ) => {
        console.log( 'announcement complete', string );
      } );
      this.startSpeakingEmitter.addListener( string => {
        this.debug && console.log( 'startSpeakingListener', string );
      } );
      this.endSpeakingEmitter.addListener( string => {
        this.debug && console.log( 'endSpeakingListener', string );
      } );
    }
  }

  public get initialized(): boolean {
    return this.isInitializedProperty.value;
  }

  /**
   * Indicate that the SpeechSynthesisAnnouncer is ready for use, and attempt to populate voices (if they are ready yet). Adds
   * listeners that control speech.
   *
   * @param userGestureEmitter - Emits when user input happens, which is required before the browser is
   *                                       allowed to use SpeechSynthesis for the first time.
   * @param [providedOptions]
   */
  public initialize( userGestureEmitter: TEmitter, providedOptions?: SpeechSynthesisInitializeOptions ): void {
    assert && assert( !this.initialized, 'can only be initialized once' );
    assert && assert( SpeechSynthesisAnnouncer.isSpeechSynthesisSupported(), 'trying to initialize speech, but speech is not supported on this platform.' );

    // See top level type documentation.
    assert && assert( initializeCount === 0, 'Only one instance of SpeechSynthesisAnnouncer can be initialized at a time.' );
    initializeCount++;

    const options = optionize<SpeechSynthesisInitializeOptions>()( {

      // {BooleanProperty|DerivedProperty.<boolean>} - Controls whether speech is allowed with speech synthesis.
      // Combined into another DerivedProperty with this.enabledProperty so you don't have to use that as one
      // of the Properties that derive speechAllowedProperty, if you are passing in a DerivedProperty.
      speechAllowedProperty: new BooleanProperty( true )
    }, providedOptions );

    this.synth = window.speechSynthesis;

    // whether the optional Property indicating speech is allowed and the SpeechSynthesisAnnouncer is enabled
    this.canSpeakProperty = DerivedProperty.and( [ options.speechAllowedProperty, this.enabledProperty ] );
    this.canSpeakProperty.link( this.boundHandleCanSpeakChange );

    // Set the speechAllowedAndFullyEnabledProperty when dependency Properties update
    Multilink.multilink(
      [ options.speechAllowedProperty, this.voicingFullyEnabledProperty ],
      ( speechAllowed, voicingFullyEnabled ) => {
        this._speechAllowedAndFullyEnabledProperty.value = speechAllowed && voicingFullyEnabled;
      } );

    // browsers tend to generate the list of voices lazily, so the list of voices may be empty until speech is first
    // requested. Some browsers don't have an addEventListener function on speechSynthesis so check to see if it exists
    // before trying to call it.
    const synth = this.getSynth()!;
    synth.addEventListener && synth.addEventListener( 'voiceschanged', () => {
      this.populateVoices();
    } );

    // try to populate voices immediately in case the browser populates them eagerly and we never get an
    // onvoiceschanged event
    this.populateVoices();

    // To get Voicing to happen quickly on Chromebooks we set the counter to a value that will trigger the "engine
    // wake" interval on the next animation frame the first time we get a user gesture. See ENGINE_WAKE_INTERVAL
    // for more information about this workaround.
    const startEngineListener = () => {
      this.timeSinceWakingEngine = ENGINE_WAKE_INTERVAL;

      // Display is on the namespace but cannot be imported due to circular dependencies
      userGestureEmitter.removeListener( startEngineListener );
    };
    userGestureEmitter.addListener( startEngineListener );

    // listener for timing variables
    stepTimer.addListener( this.step.bind( this ) );

    this.isInitializedProperty.value = true;
  }

  /**
   * @param dt - in seconds from stepTimer
   */
  private step( dt: number ): void {

    // convert to ms
    dt *= 1000;

    // if initialized, this means we have a synth.
    const synth = this.getSynth();

    if ( this.initialized && synth ) {

      // If we haven't spoken yet, keep checking the synth to determine when there has been a successful usage
      // of SpeechSynthesis. Note this will be true if ANY SpeechSynthesisAnnouncer has successful speech (not just
      // this instance).
      if ( !this.hasSpoken ) {
        this.hasSpoken = synth.speaking;
      }

      // Increment the amount of time since the synth has stopped speaking the previous utterance, but don't
      // start counting up until the synth has finished speaking its current utterance.
      this.timeSinceUtteranceEnd = synth.speaking ? 0 : this.timeSinceUtteranceEnd + dt;


      this.timeSincePendingUtterance = ( this.speakingSpeechSynthesisUtteranceWrapper && !this.speakingSpeechSynthesisUtteranceWrapper.started ) ?
                                       this.timeSincePendingUtterance + dt : 0;

      if ( this.timeSincePendingUtterance > PENDING_UTTERANCE_DELAY ) {
        assert && assert( this.speakingSpeechSynthesisUtteranceWrapper, 'should have this.speakingSpeechSynthesisUtteranceWrapper' );

        // It has been too long since we requested speech without speaking, the synth is likely failing on this platform
        this.handleSpeechSynthesisEnd( this.speakingSpeechSynthesisUtteranceWrapper!.announceText, this.speakingSpeechSynthesisUtteranceWrapper! );
        this.speakingSpeechSynthesisUtteranceWrapper = null;

        // cancel the synth because we really don't want it to keep trying to speak this utterance after handling
        // the assumed failure
        this.cancelSynth();
      }

      // Wait until VOICING_UTTERANCE_INTERVAL to speak again for more consistent behavior on certain platforms,
      // see documentation for the constant for more information. By setting readyToAnnounce in the step function
      // we also don't have to rely at all on the SpeechSynthesisUtterance 'end' event, which is inconsistent on
      // certain platforms. Also, not ready to announce if we are waiting for the synth to start speaking something.
      if ( this.timeSinceUtteranceEnd > VOICING_UTTERANCE_INTERVAL && !this.speakingSpeechSynthesisUtteranceWrapper ) {
        this.readyToAnnounce = true;
      }

      // SpeechSynthesisUtterances longer than 15 seconds will get interrupted on Chrome and fail to stop with
      // end or error events. https://bugs.chromium.org/p/chromium/issues/detail?id=679437 suggests a workaround
      // that uses pause/resume like this. The workaround is needed for desktop Chrome when using `localService: false`
      // voices. The bug does not appear on any Microsoft Edge voices. This workaround breaks SpeechSynthesis on
      // android. In this check we only use this workaround where needed.
      if ( platform.chromium && !platform.android && ( this.voiceProperty.value && !this.voiceProperty.value.localService ) ) {

        // Not necessary to apply the workaround unless we are currently speaking.
        this.timeSincePauseResume = synth.speaking ? this.timeSincePauseResume + dt : 0;
        if ( this.timeSincePauseResume > PAUSE_RESUME_WORKAROUND_INTERVAL ) {
          this.timeSincePauseResume = 0;
          synth.pause();
          synth.resume();
        }
      }

      // A workaround to keep SpeechSynthesis responsive on Chromebooks. If there is a long enough interval between
      // speech requests, the next time SpeechSynthesis is used it is very slow on Chromebook. We think the browser
      // turns "off" the synthesis engine for performance. If it has been long enough since using speech synthesis and
      // there is nothing to speak in the queue, requesting speech with empty content keeps the engine active.
      // See https://github.com/phetsims/gravity-force-lab-basics/issues/303.
      if ( platform.chromeOS ) {
        this.timeSinceWakingEngine += dt;
        if ( !synth.speaking && this.timeSinceWakingEngine > ENGINE_WAKE_INTERVAL ) {
          this.timeSinceWakingEngine = 0;

          // This space is actually quite important. An empty string began breaking chromebooks in https://github.com/phetsims/friction/issues/328
          synth.speak( new SpeechSynthesisUtterance( ' ' ) );
        }
      }
    }
  }

  /**
   * When we can no longer speak, cancel all speech to silence everything.
   */
  private handleCanSpeakChange( canSpeak: boolean ): void {
    if ( !canSpeak ) { this.cancel(); }
  }

  /**
   * Update the list of `voices` available to the synth, and notify that the list has changed.
   */
  private populateVoices(): void {
    const synth = this.getSynth();
    if ( synth ) {

      // the browser sometimes provides duplicate voices, prune those out of the list
      this.voicesProperty.value = _.uniqBy( synth.getVoices(), voice => voice.name );
    }
  }

  /**
   * Returns an array of SpeechSynthesisVoices that are sorted such that the best sounding voices come first.
   * As of 9/27/21, we find that the "Google" voices sound best while Apple's "Fred" sounds the worst so the list
   * will be ordered to reflect that. This way "Google" voices will be selected by default when available and "Fred"
   * will almost never be the default Voice since it is last in the list. See
   * https://github.com/phetsims/scenery/issues/1282/ for discussion and this decision.
   */
  public getPrioritizedVoices(): SpeechSynthesisVoice[] {
    assert && assert( this.initialized, 'No voices available until the SpeechSynthesisAnnouncer is initialized' );
    assert && assert( this.voicesProperty.value.length > 0, 'No voices available to provided a prioritized list.' );

    const allVoices = this.voicesProperty.value.slice();

    // exclude "novelty" voices that are included by the operating system but marked as English.
    // const voicesWithoutNovelty = _.filter( allVoices, voice => !NOVELTY_VOICES.includes( voice.name ) );
    const voicesWithoutNovelty = _.filter( allVoices, voice => {

      // Remove the voice if the SpeechSynthesisVoice.name includes a substring of the entry in our list (the browser
      // might include more information in the name than we maintain, like locale info or something else).
      return !_.some( NOVELTY_VOICES, noveltyVoice => voice.name.includes( noveltyVoice ) );
    } );

    const getIndex = ( voice: SpeechSynthesisVoice ) =>
      voice.name.includes( 'Google' ) ? -1 : // Google should move toward the front
      voice.name.includes( 'Fred' ) ? voicesWithoutNovelty.length : // Fred should move toward the back
      voicesWithoutNovelty.indexOf( voice ); // Otherwise preserve ordering

    return voicesWithoutNovelty.sort( ( a, b ) => getIndex( a ) - getIndex( b ) );

  }

  /**
   * Voicing as a feature is not translatable. This function gets the "prioritized" voices (as decided by PhET) and
   * prunes out the non-english ones. This does not use this.getPrioritizedVoicesForLocale because the required Locale
   * type doesn't include 'en-US' or 'en_US' as valid values, just 'en'.
   */
  public getEnglishPrioritizedVoices(): SpeechSynthesisVoice[] {
    return _.filter( this.getPrioritizedVoices(), voice => {

      // most browsers use dashes to separate the local, Android uses underscore.
      return voice.lang === 'en-US' || voice.lang === 'en_US';
    } );
  }

  /**
   * Voicing as a feature is not translatable, but some SpeechSynthesisAnnouncer usages outside of voicing are. This
   * function gets the "prioritized" voices (as decided by PhET) and
   * prunes out everything that is not the "provided" locale. The algorithm for mapping locale is as follows:
   *
   * locale: 'en' - Provided locale parameter
   * voice: 'en_GB' - YES matches!
   * voice: 'en' - YES
   *
   * locale: 'en_GB'
   * voice: 'en' - NO
   * voice: 'en_GB' - YES
   * voice: 'en-GB' - YES
   * voice: 'en-US' - NO
   *
   * locale: 'zh_CN'
   * voice: 'zh' - NO
   * voice: 'zh_CN' - YES
   *
   * locale: 'zh'
   * voice: 'zh' - YES
   * voice: 'zh_CN' - YES
   * voice: 'zh-TW' - YES
   *
   * locale: 'es_ES'
   * voice: 'es_MX' - NO
   * voice: 'es' - NO
   * voice: 'es-ES' - YES
   */
  public getPrioritizedVoicesForLocale( locale: Locale ): SpeechSynthesisVoice[] {

    // Four letter locales of type Locale include an underscore between the language and the region. Most browser voice
    // names use a dash instead of an underscore, so we need to create a version of the locale with dashes.
    const underscoreLocale = locale;
    const dashLocale = locale.replace( '_', '-' );

    return _.filter( this.getPrioritizedVoices(), voice => {

      // Handle unsupported locale mapping here, see voiceLangToSupportedLocale and https://github.com/phetsims/number-play/issues/230.
      const voiceLang = voiceLangToSupportedLocale.hasOwnProperty( voice.lang ) ?
                        voiceLangToSupportedLocale[ voice.lang ] :
                        voice.lang;

      let matchesShortLocale = false;
      if ( voiceLang.includes( '_' ) || voiceLang.includes( '-' ) ) {

        // Mapping zh_CN or zh-CN -> zh
        matchesShortLocale = underscoreLocale === voiceLang.slice( 0, 2 );
      }

      // while most browsers use dashes to separate the local, Android uses underscore, so compare both types. Loosely
      // compare with includes() so all country-specific voices are available for two-letter Locale codes.
      return matchesShortLocale || underscoreLocale === voiceLang || dashLocale === voiceLang;
    } );
  }

  /**
   * Implements announce so the SpeechSynthesisAnnouncer can be a source of output for utteranceQueue.
   */
  public override announce( announceText: ResolvedResponse, utterance: Utterance ): void {
    if ( this.initialized && this.canSpeakProperty && this.canSpeakProperty.value ) {
      this.requestSpeech( announceText, utterance );
    }
    else {

      // The announcer is not going to announce this utterance, signify that we are done with it.
      this.handleAnnouncementFailure( utterance, announceText );
    }
  }

  /**
   * The announcement of this utterance has failed in some way, signify to clients of this announcer that the utterance
   * will never complete. For example start/end events on the SpeechSynthesisUtterance will never fire.
   */
  private handleAnnouncementFailure( utterance: Utterance, announceText: ResolvedResponse ): void {
    this.debug && console.log( 'announcement failure', announceText );
    this.announcementCompleteEmitter.emit( utterance, announceText );
  }

  /**
   * Use speech synthesis to speak an utterance. No-op unless SpeechSynthesisAnnouncer is initialized and other output
   * controlling Properties are true (see speechAllowedProperty in initialize()). This explicitly ignores
   * this.enabledProperty, allowing speech even when SpeechSynthesisAnnouncer is disabled. This is useful in rare cases, for
   * example when the SpeechSynthesisAnnouncer recently becomes disabled by the user and we need to announce confirmation of
   * that decision ("Voicing off" or "All audio off").
   *
   * NOTE: This will interrupt any currently speaking utterance.
   */
  public speakIgnoringEnabled( utterance: Utterance ): void {
    if ( this.initialized ) {
      this.cancel();
      this.requestSpeech( utterance.getAlertText( this.respectResponseCollectorProperties ), utterance );
    }
  }

  /**
   * Request speech with SpeechSynthesis.
   */
  private requestSpeech( announceText: ResolvedResponse, utterance: Utterance ): void {
    assert && assert( SpeechSynthesisAnnouncer.isSpeechSynthesisSupported(), 'trying to speak with speechSynthesis, but it is not supported on this platform' );

    this.debug && console.log( 'requestSpeech', announceText );

    // If the utterance text is null, then opt out early
    if ( !announceText ) {
      this.handleAnnouncementFailure( utterance, announceText );
      return;
    }

    // Utterance.announcerOptions must be more general to allow this type to apply to any implementation of Announcer, thus "Object" as the provided options.
    const utteranceOptions = optionize3<SpeechSynthesisAnnounceOptions, SpeechSynthesisAnnounceOptions>()(
      {}, UTTERANCE_OPTION_DEFAULTS, utterance.announcerOptions
    );

    // embedding marks (for i18n) impact the output, strip before speaking, type cast number to string if applicable (for number)
    const stringToSpeak = removeBrTags( stripEmbeddingMarks( announceText + '' ) );

    // Disallow any unfilled template variables to be set in the PDOM.
    validate( stringToSpeak, Validation.STRING_WITHOUT_TEMPLATE_VARS_VALIDATOR );

    const speechSynthUtterance = new SpeechSynthesisUtterance( stringToSpeak );
    speechSynthUtterance.voice = utteranceOptions.voice || this.voiceProperty.value;
    speechSynthUtterance.pitch = this.voicePitchProperty.value;
    speechSynthUtterance.rate = this.voiceRateProperty.value;
    speechSynthUtterance.volume = this.voiceVolumeProperty.value;

    const startListener = () => {
      this.startSpeakingEmitter.emit( stringToSpeak, utterance );

      assert && assert( this.speakingSpeechSynthesisUtteranceWrapper, 'should have been set in requestSpeech' );
      this.speakingSpeechSynthesisUtteranceWrapper!.started = true;

      speechSynthUtterance.removeEventListener( 'start', startListener );
    };

    const endListener = () => {
      this.handleSpeechSynthesisEnd( stringToSpeak, speechSynthesisUtteranceWrapper );
    };

    // Keep a reference to the SpeechSynthesisUtterance and the start/endListeners so that we can remove them later.
    // Notice this is used in the function scopes above.
    // IMPORTANT NOTE: Also, this acts as a workaround for a Safari bug where the `end` event does not fire
    // consistently. If the SpeechSynthesisUtterance is not in memory when it is time for the `end` event, Safari
    // will fail to emit that event. See
    // https://stackoverflow.com/questions/23483990/speechsynthesis-api-onend-callback-not-working and
    // https://github.com/phetsims/john-travoltage/issues/435 and https://github.com/phetsims/utterance-queue/issues/52
    const speechSynthesisUtteranceWrapper = new SpeechSynthesisUtteranceWrapper( utterance, announceText, speechSynthUtterance, false, endListener, startListener );

    assert && assert( this.speakingSpeechSynthesisUtteranceWrapper === null, 'Wrapper should be null, we should have received an end event to clear it before the next one.' );
    this.speakingSpeechSynthesisUtteranceWrapper = speechSynthesisUtteranceWrapper;

    speechSynthUtterance.addEventListener( 'start', startListener );
    speechSynthUtterance.addEventListener( 'end', endListener );

    // In Safari the `end` listener does not fire consistently, (especially after cancel)
    // but the error event does. In this case signify that speaking has ended.
    speechSynthUtterance.addEventListener( 'error', endListener );

    // Signify to the utterance-queue that we cannot speak yet until this utterance has finished
    this.readyToAnnounce = false;

    // This is generally set in the step function when the synth is not speaking, but there is a Firefox issue where
    // the SpeechSynthesis.speaking is set to `true` asynchronously. So we eagerly reset this timing variable to
    // signify that we need to wait VOICING_UTTERANCE_INTERVAL until we are allowed to speak again.
    // See https://github.com/phetsims/utterance-queue/issues/40
    this.timeSinceUtteranceEnd = 0;

    // Interrupt if the Utterance can no longer be announced.
    utterance.canAnnounceProperty.link( this.boundHandleCanAnnounceChange );
    utterance.voicingCanAnnounceProperty.link( this.boundHandleCanAnnounceChange );

    this.getSynth()!.speak( speechSynthUtterance );
  }

  /**
   * When a canAnnounceProperty changes to false for an Utterance, that utterance should be cancelled.
   */
  private handleCanAnnounceChange(): void {
    if ( this.speakingSpeechSynthesisUtteranceWrapper ) {
      this.cancelUtteranceIfCanAnnounceFalse( this.speakingSpeechSynthesisUtteranceWrapper.utterance );
    }
  }

  /**
   * When a canAnnounceProperty changes, cancel the Utterance if the value becomes false.
   */
  private cancelUtteranceIfCanAnnounceFalse( utterance: Utterance ): void {
    if ( !utterance.canAnnounceProperty.value || !utterance.voicingCanAnnounceProperty.value ) {
      this.cancelUtterance( utterance );
    }
  }

  /**
   * All the work necessary when we are finished with an utterance, intended for end or cancel.
   * Emits events signifying that we are done with speech and does some disposal.
   */
  private handleSpeechSynthesisEnd( stringToSpeak: ResolvedResponse, speechSynthesisUtteranceWrapper: SpeechSynthesisUtteranceWrapper ): void {
    this.endSpeakingEmitter.emit( stringToSpeak, speechSynthesisUtteranceWrapper.utterance );
    this.announcementCompleteEmitter.emit( speechSynthesisUtteranceWrapper.utterance, speechSynthesisUtteranceWrapper.speechSynthesisUtterance.text );

    speechSynthesisUtteranceWrapper.speechSynthesisUtterance.removeEventListener( 'error', speechSynthesisUtteranceWrapper.endListener );
    speechSynthesisUtteranceWrapper.speechSynthesisUtterance.removeEventListener( 'end', speechSynthesisUtteranceWrapper.endListener );
    speechSynthesisUtteranceWrapper.speechSynthesisUtterance.removeEventListener( 'start', speechSynthesisUtteranceWrapper.startListener );

    // The endSpeakingEmitter may end up calling handleSpeechSynthesisEnd in its listeners, we need to be graceful
    const utteranceCanAnnounceProperty = speechSynthesisUtteranceWrapper.utterance.canAnnounceProperty;
    if ( utteranceCanAnnounceProperty.hasListener( this.boundHandleCanAnnounceChange ) ) {
      utteranceCanAnnounceProperty.unlink( this.boundHandleCanAnnounceChange );
    }

    const utteranceVoicingCanAnnounceProperty = speechSynthesisUtteranceWrapper.utterance.voicingCanAnnounceProperty;
    if ( utteranceVoicingCanAnnounceProperty.hasListener( this.boundHandleCanAnnounceChange ) ) {
      utteranceVoicingCanAnnounceProperty.unlink( this.boundHandleCanAnnounceChange );
    }

    this.speakingSpeechSynthesisUtteranceWrapper = null;
  }

  /**
   * Returns a references to the SpeechSynthesis of the SpeechSynthesisAnnouncer that is used to request speech with the Web
   * Speech API. Every references has a check to ensure that the synth is available.
   */
  private getSynth(): null | SpeechSynthesis {
    assert && assert( SpeechSynthesisAnnouncer.isSpeechSynthesisSupported(), 'Trying to use SpeechSynthesis, but it is not supported on this platform.' );
    return this.synth;
  }

  /**
   * Stops any Utterance that is currently being announced or is (about to be announced).
   * (utterance-queue internal)
   */
  public cancel(): void {
    if ( this.initialized ) {
      this.speakingSpeechSynthesisUtteranceWrapper && this.cancelUtterance( this.speakingSpeechSynthesisUtteranceWrapper.utterance );
    }
  }

  /**
   * Cancel the provided Utterance, if it is currently being spoken by this Announcer. Does not cancel
   * any other utterances that may be in the UtteranceQueue.
   * (utterance-queue internal)
   */
  public override cancelUtterance( utterance: Utterance ): void {

    const wrapper = this.speakingSpeechSynthesisUtteranceWrapper;

    if ( wrapper && utterance === wrapper.utterance ) {
      this.handleSpeechSynthesisEnd( wrapper.announceText, wrapper );

      // silence all speech - after handleSpeechSynthesisEnd so we don't do that work twice in case `cancelSynth`
      // also triggers end events immediately (but that doesn't happen on all browsers)
      this.cancelSynth();
    }
  }

  /**
   * Given one utterance, should it cancel another provided utterance?
   */
  public override shouldUtteranceCancelOther( utterance: Utterance, utteranceToCancel: Utterance ): boolean {

    // Utterance.announcerOptions must be more general to allow this type to apply to any implementation of Announcer, thus "Object" as the provided options.
    const utteranceOptions = optionize3<SpeechSynthesisAnnounceOptions, SpeechSynthesisAnnounceOptions>()(
      {}, UTTERANCE_OPTION_DEFAULTS, utterance.announcerOptions
    );

    let shouldCancel;
    if ( utteranceToCancel.priorityProperty.value !== utterance.priorityProperty.value ) {
      shouldCancel = utteranceToCancel.priorityProperty.value < utterance.priorityProperty.value;
    }
    else {
      shouldCancel = utteranceOptions.cancelOther;
      if ( utteranceToCancel && utteranceToCancel === utterance ) {
        shouldCancel = utteranceOptions.cancelSelf;
      }
    }

    return shouldCancel;
  }

  /**
   * When the priority for a new utterance changes or if a new utterance is added to the queue, determine whether
   * we should cancel the synth immediately.
   */
  public override onUtterancePriorityChange( nextAvailableUtterance: Utterance ): void {

    // test against what is currently being spoken by the synth
    const wrapper = this.speakingSpeechSynthesisUtteranceWrapper;
    if ( wrapper && this.shouldUtteranceCancelOther( nextAvailableUtterance, wrapper.utterance ) ) {
      this.cancelUtterance( wrapper.utterance );
    }
  }

  /**
   * Cancel the synth. This will silence speech. This will silence any speech and cancel the
   */
  private cancelSynth(): void {
    assert && assert( this.initialized, 'must be initialized to use synth' );
    const synth = this.getSynth()!;
    synth && synth.cancel();
  }

  /**
   * Returns true if SpeechSynthesis is available on the window. This check is sufficient for all of
   * SpeechSynthesisAnnouncer. On platforms where speechSynthesis is available, all features of it are available, except for the
   * onvoiceschanged event in a couple of platforms. However, the listener can still be set
   * without issue on those platforms so we don't need to check for its existence. On those platforms, voices
   * are provided right on load.
   */
  public static isSpeechSynthesisSupported(): boolean {
    return !!window.speechSynthesis && !!window.SpeechSynthesisUtterance;
  }
}

/**
 * An inner class that combines some objects that are necessary to keep track of to dispose
 * SpeechSynthesisUtterances when it is time. It is also used for the "Safari Workaround" to keep a reference
 * of the SpeechSynthesisUtterance in memory long enough for the 'end' event to be emitted.
 */
class SpeechSynthesisUtteranceWrapper {
  public constructor( public readonly utterance: Utterance,
                      public readonly announceText: ResolvedResponse,
                      public readonly speechSynthesisUtterance: SpeechSynthesisUtterance,
                      public started: boolean,
                      public readonly endListener: () => void,
                      public readonly startListener: () => void ) {
  }
}

/**
 * Remove <br> or <br/> tags from a string
 * @param string - plain text or html string
 */
function removeBrTags( string: string ): string {
  return string.split( '<br/>' ).join( ' ' ).split( '<br>' ).join( ' ' );
}

const SpeechSynthesisVoiceIO = new IOType( 'SpeechSynthesisVoiceIO', {
  isValidValue: v => true, // SpeechSynthesisVoice is not available on window
  toStateObject: speechSynthesisVoice => speechSynthesisVoice.name
} );

utteranceQueueNamespace.register( 'SpeechSynthesisAnnouncer', SpeechSynthesisAnnouncer );
export default SpeechSynthesisAnnouncer;