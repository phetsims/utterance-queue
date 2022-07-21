// Copyright 2022, University of Colorado Boulder

/**
 * Uses the Web Speech API to produce speech from the browser. There is no speech output until the voicingManager has
 * been initialized. Supported voices will depend on platform. For each voice, you can customize the rate and pitch.
 * Only one voicingManager should be active at a time and so this type is a singleton.
 *
 * @author Jesse Greenberg
 */

import BooleanProperty from '../../axon/js/BooleanProperty.js';
import DerivedProperty from '../../axon/js/DerivedProperty.js';
import Emitter from '../../axon/js/Emitter.js';
import EnabledComponent from '../../axon/js/EnabledComponent.js';
import IProperty from '../../axon/js/IProperty.js';
import IReadOnlyProperty from '../../axon/js/IReadOnlyProperty.js';
import NumberProperty from '../../axon/js/NumberProperty.js';
import Property from '../../axon/js/Property.js';
import Range from '../../dot/js/Range.js';
import optionize, { EmptySelfOptions, optionize3, OptionizeDefaults } from '../../phet-core/js/optionize.js';
import stripEmbeddingMarks from '../../phet-core/js/stripEmbeddingMarks.js';
import Announcer, { AnnouncerOptions } from '../../utterance-queue/js/Announcer.js';
import Utterance from '../../utterance-queue/js/Utterance.js';
import SpeechSynthesisParentPolyfill from './SpeechSynthesisParentPolyfill.js';
import utteranceQueueNamespace from './utteranceQueueNamespace.js';
import { ResolvedResponse } from './ResponsePacket.js';
import stepTimer from '../../axon/js/stepTimer.js';
import platform from '../../phet-core/js/platform.js';
import Multilink from '../../axon/js/Multilink.js';
import IEmitter from '../../axon/js/IEmitter.js';

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

type SpeechSynthesisAnnounceOptions = {
  cancelSelf?: boolean;
  cancelOther?: boolean;
};

const UTTERANCE_OPTION_DEFAULTS: OptionizeDefaults<SpeechSynthesisAnnounceOptions> = {

  // {boolean} - If true and this Utterance is currently being spoken by the speech synth, announcing it
  // to the queue again will immediately cancel the synth and new content will be
  // spoken. Otherwise, new content for this utterance will be spoken whenever the old
  // content has finished speaking
  cancelSelf: true,

  // {boolean} - Only applies to two Utterances with the same priority. If true and another Utterance is currently
  // being spoken by the speech synth (or queued by voicingManager), announcing this Utterance will immediately cancel
  // the other content being spoken by the synth. Otherwise, content for the new utterance will be spoken as soon as
  // the browser finishes speaking the utterances in front of it in line.
  cancelOther: true
};

// Options to the initialize function
export type SpeechSynthesisInitializeOptions = {
  speechAllowedProperty?: IReadOnlyProperty<boolean>;
};

type SelfOptions = EmptySelfOptions;
export type SpeechSynthesisAnnouncerOptions = AnnouncerOptions;

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
  public readonly startSpeakingEmitter: IEmitter<[ ResolvedResponse, Utterance ]>;
  public readonly endSpeakingEmitter: IEmitter<[ ResolvedResponse, Utterance ]>;

  //  emits whenever the voices change for SpeechSynthesis
  public voicesChangedEmitter: IEmitter;

  // To get around multiple inheritance issues, create enabledProperty via composition instead, then create
  // a reference on this component for the enabledProperty
  private enabledComponentImplementation: EnabledComponent;
  public readonly enabledProperty: IProperty<boolean>;

  // Controls whether Voicing is enabled in a "main window" area of the application.
  // This supports the ability to disable Voicing for the important screen content of your application while keeping
  // Voicing for surrounding UI components enabled (for example).
  public readonly mainWindowVoicingEnabledProperty: Property<boolean>;

  // Property that indicates that the Voicing feature is enabled for all areas of the application.
  public voicingFullyEnabledProperty: IReadOnlyProperty<boolean>;

  // Indicates whether speech is fully enabled AND speech is allowed, as specified
  // by the Property provided in initialize(). See speechAllowedProperty of initialize(). In order for this Property
  // to be true, speechAllowedProperty, enabledProperty, and mainWindowVoicingEnabledProperty must all be true.
  // Initialized in the constructor because we don't have access to all the dependency Properties until initialize.
  // These two variable keep a public, readonly interface. We cannot use a DerivedProperty because it needs to be
  // listened to before its dependencies are created, see https://github.com/phetsims/utterance-queue/issues/72
  public readonly speechAllowedAndFullyEnabledProperty: IReadOnlyProperty<boolean>;
  private readonly _speechAllowedAndFullyEnabledProperty: IProperty<boolean>;

  // synth from Web Speech API that drives speech, defined on initialize
  private synth: null | SpeechSynthesis;

  // possible voices for Web Speech synthesis
  public voices: SpeechSynthesisVoice[];

  // A references is kept so that we can remove listeners
  // from the SpeechSynthesisUtterance when the voicingManager finishes speaking the Utterance.
  private speakingSpeechSynthesisUtteranceWrapper: SpeechSynthesisUtteranceWrapper | null;

  // is the VoicingManager initialized for use? This is prototypal so it isn't always initialized
  public initialized: boolean;

  // Controls whether speech is allowed with synthesis. Null until initialized, and can be set by options to
  // initialize().
  private canSpeakProperty: IReadOnlyProperty<boolean> | null;

  // bound so we can link and unlink to this.canSpeakProperty when the voicingManager becomes initialized.
  private readonly boundHandleCanSpeakChange: ( canSpeak: boolean ) => void;

  // A listener that will cancel the Utterance that is being announced if its canAnnounceProperty becomes false.
  // Set when this Announcer begins to announce a new Utterance and cleared when the Utterance is finished/cancelled.
  // Bound so that the listener can be added and removed on Utterances without creating many closures.
  private readonly boundHandleCanAnnounceChange: ( canAnnounce: boolean ) => void;

  // Only public for unit tests! A reference to the utterance currently in the synth
  // being spoken by the browser, so we can determine cancelling behavior when it is time to speak the next utterance.
  // See voicing's supported announcerOptions for details.
  private currentlySpeakingUtterance: Utterance | null;

  // A reference to the Utterance that is about to be spoken. Cleared the moment
  // speech starts (the start event of the SpeechSynthesisUtterance). Depending on the platform there may be
  // a delay between the speak() call and when the synth actually starts speaking.
  private pendingSpeechSynthesisUtteranceWrapper: SpeechSynthesisUtteranceWrapper | null;

  public constructor( providedOptions?: SpeechSynthesisAnnouncerOptions ) {

    const options = optionize<SpeechSynthesisAnnouncerOptions, SelfOptions, AnnouncerOptions>()( {

      // {boolean} - SpeechSynthesisAnnouncer generally doesn't care about ResponseCollectorProperties,
      // that is more specific to the Voicing feature.
      respectResponseCollectorProperties: false
    }, providedOptions );

    super( options );
    this.voiceProperty = new Property<null | SpeechSynthesisVoice>( null );
    this.voiceRateProperty = new NumberProperty( 1.0, { range: new Range( 0.75, 2 ) } );
    this.voicePitchProperty = new NumberProperty( 1.0, { range: new Range( 0.5, 2 ) } );
    this.voiceVolumeProperty = new NumberProperty( 1.0, { range: new Range( 0, 1 ) } );

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

    this.voicesChangedEmitter = new Emitter();

    this.enabledComponentImplementation = new EnabledComponent( {

      // initial value for the enabledProperty, false because speech should not happen until requested by user
      enabled: false,

      // phet-io
      phetioEnabledPropertyInstrumented: false
    } );

    assert && assert( this.enabledComponentImplementation.enabledProperty.isSettable(), 'enabledProperty must be settable' );
    this.enabledProperty = this.enabledComponentImplementation.enabledProperty;

    this.mainWindowVoicingEnabledProperty = new BooleanProperty( true );

    this.voicingFullyEnabledProperty = DerivedProperty.and( [ this.enabledProperty, this.mainWindowVoicingEnabledProperty ] );

    this._speechAllowedAndFullyEnabledProperty = new BooleanProperty( false );
    this.speechAllowedAndFullyEnabledProperty = this._speechAllowedAndFullyEnabledProperty;

    this.synth = null;
    this.voices = [];

    this.speakingSpeechSynthesisUtteranceWrapper = null;
    this.initialized = false;
    this.canSpeakProperty = null;
    this.boundHandleCanSpeakChange = this.handleCanSpeakChange.bind( this );
    this.boundHandleCanAnnounceChange = this.handleCanAnnounceChange.bind( this );
    this.currentlySpeakingUtterance = null;
    this.pendingSpeechSynthesisUtteranceWrapper = null;
  }

  /**
   * Indicate that the voicingManager is ready for use, and attempt to populate voices (if they are ready yet). Adds
   * listeners that control speech.
   *
   * @param userGestureEmitter - Emits when user input happens, which is required before the browser is
   *                                       allowed to use SpeechSynthesis for the first time.
   * @param [providedOptions]
   */
  public initialize( userGestureEmitter: IEmitter, providedOptions?: SpeechSynthesisInitializeOptions ): void {
    assert && assert( this.initialized === false, 'can only be initialized once' );
    assert && assert( SpeechSynthesisAnnouncer.isSpeechSynthesisSupported(), 'trying to initialize speech, but speech is not supported on this platform.' );

    const options = optionize<SpeechSynthesisInitializeOptions>()( {

      // {BooleanProperty|DerivedProperty.<boolean>} - Controls whether speech is allowed with speech synthesis.
      // Combined into another DerivedProperty with this.enabledProperty so you don't have to use that as one
      // of the Properties that derive speechAllowedProperty, if you are passing in a DerivedProperty.
      speechAllowedProperty: new BooleanProperty( true )
    }, providedOptions );

    this.synth = window.speechSynthesis;

    // whether the optional Property indicating speech is allowed and the voicingManager is enabled
    this.canSpeakProperty = DerivedProperty.and( [ options.speechAllowedProperty, this.enabledProperty ] );
    this.canSpeakProperty.link( this.boundHandleCanSpeakChange );

    // Set the speechAllowedAndFullyEnabledProperty when dependency Properties update
    Multilink.multilink(
      [ options.speechAllowedProperty, this.voicingFullyEnabledProperty ],
      ( speechAllowed, voicingFullyEnabled ) => {
        this._speechAllowedAndFullyEnabledProperty.value = speechAllowed && voicingFullyEnabled;
      } );

    // browsers tend to generate the list of voices lazily, so the list of voices may be empty until speech is
    // first requested
    this.getSynth()!.onvoiceschanged = () => {
      this.populateVoices();
    };

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

    this.initialized = true;
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

      this.timeSincePendingUtterance = this.pendingSpeechSynthesisUtteranceWrapper ? this.timeSincePendingUtterance + dt : 0;

      if ( this.timeSincePendingUtterance > PENDING_UTTERANCE_DELAY ) {
        assert && assert( this.pendingSpeechSynthesisUtteranceWrapper, 'should have this.pendingSpeechSynthesisUtteranceWrapper' );

        // It has been too long since we requested speech without speaking, the synth is likely failing on this platform
        this.handleSpeechSynthesisEnd( this.pendingSpeechSynthesisUtteranceWrapper!.announceText, this.pendingSpeechSynthesisUtteranceWrapper! );
        this.pendingSpeechSynthesisUtteranceWrapper = null;

        // cancel the synth because we really don't want it to keep trying to speak this utterance after handling
        // the assumed failure
        this.cancelSynth();
      }

      // Wait until VOICING_UTTERANCE_INTERVAL to speak again for more consistent behavior on certain platforms,
      // see documentation for the constant for more information. By setting readyToAnnounce in the step function
      // we also don't have to rely at all on the SpeechSynthesisUtterance 'end' event, which is inconsistent on
      // certain platforms. Also, not ready to announce if we are waiting for the synth to start speaking something.
      if ( this.timeSinceUtteranceEnd > VOICING_UTTERANCE_INTERVAL && !this.pendingSpeechSynthesisUtteranceWrapper ) {
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
      this.timeSinceWakingEngine += dt;
      if ( !synth.speaking && this.timeSinceWakingEngine > ENGINE_WAKE_INTERVAL ) {
        this.timeSinceWakingEngine = 0;
        synth.speak( new SpeechSynthesisUtterance( '' ) );
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
      this.voices = _.uniqBy( synth.getVoices(), voice => voice.name );
      this.voicesChangedEmitter.emit();
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
    assert && assert( this.initialized, 'No voices available until the voicingManager is initialized' );
    assert && assert( this.voices.length > 0, 'No voices available to provided a prioritized list.' );

    const voices = this.voices.slice();

    const getIndex = ( voice: SpeechSynthesisVoice ) =>
      voice.name.includes( 'Google' ) ? -1 : // Google should move toward the front
      voice.name.includes( 'Fred' ) ? voices.length : // Fred should move toward the back
      voices.indexOf( voice ); // Otherwise preserve ordering

    return voices.sort( ( a, b ) => getIndex( a ) - getIndex( b ) );

  }

  /**
   * Implements announce so the voicingManager can be a source of output for utteranceQueue.
   */
  public override announce( announceText: ResolvedResponse, utterance: Utterance ): void {
    assert && assert( this.canSpeakProperty, 'should have a can speak Property' );
    if ( this.initialized && this.canSpeakProperty!.value ) {
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
    this.announcementCompleteEmitter.emit( utterance, announceText );
  }

  /**
   * Use speech synthesis to speak an utterance. No-op unless voicingManager is initialized and other output
   * controlling Properties are true (see speechAllowedProperty in initialize()). This explicitly ignores
   * this.enabledProperty, allowing speech even when voicingManager is disabled. This is useful in rare cases, for
   * example when the voicingManager recently becomes disabled by the user and we need to announce confirmation of
   * that decision ("Voicing off" or "All audio off").
   */
  public speakIgnoringEnabled( utterance: Utterance ): void {
    if ( this.initialized ) {
      this.requestSpeech( utterance.getAlertText( this.respectResponseCollectorProperties ), utterance );
    }
  }

  /**
   * Request speech with SpeechSynthesis.
   */
  private requestSpeech( announceText: ResolvedResponse, utterance: Utterance ): void {
    assert && assert( SpeechSynthesisAnnouncer.isSpeechSynthesisSupported(), 'trying to speak with speechSynthesis, but it is not supported on this platform' );

    // If the utterance text is null, then opt out early
    if ( !announceText ) {
      this.handleAnnouncementFailure( utterance, announceText );
      return;
    }

    // embedding marks (for i18n) impact the output, strip before speaking, type cast number to string if applicable (for number)
    const stringToSpeak = removeBrTags( stripEmbeddingMarks( announceText + '' ) );
    const speechSynthUtterance = new SpeechSynthesisUtterance( stringToSpeak );
    speechSynthUtterance.voice = this.voiceProperty.value;
    speechSynthUtterance.pitch = this.voicePitchProperty.value;
    speechSynthUtterance.rate = this.voiceRateProperty.value;
    speechSynthUtterance.volume = this.voiceVolumeProperty.value;

    const startListener = () => {
      this.startSpeakingEmitter.emit( stringToSpeak, utterance );

      // Important that the pendingSpeechSynthesisUtteranceWrapper is cleared in the start event instead of when `synth.speaking` is
      // set to true because `synth.speaking` is incorrectly set to true before there is successful speech in ChromeOS.
      // See https://github.com/phetsims/utterance-queue/issues/66 and https://github.com/phetsims/utterance-queue/issues/64
      this.pendingSpeechSynthesisUtteranceWrapper = null;
      this.currentlySpeakingUtterance = utterance;

      // Interrupt if the Utterance can no longer be announced.
      utterance.canAnnounceProperty.link( this.boundHandleCanAnnounceChange );
      utterance.voicingCanAnnounceProperty.link( this.boundHandleCanAnnounceChange );

      assert && assert( this.speakingSpeechSynthesisUtteranceWrapper === null, 'Wrapper should be null, we should have received an end event to clear it.' );
      this.speakingSpeechSynthesisUtteranceWrapper = speechSynthesisUtteranceWrapper;

      speechSynthUtterance.removeEventListener( 'start', startListener );
    };

    const endListener = () => {
      this.handleSpeechSynthesisEnd( stringToSpeak, speechSynthesisUtteranceWrapper );
    };

    speechSynthUtterance.addEventListener( 'start', startListener );
    speechSynthUtterance.addEventListener( 'end', endListener );

    // Keep a reference to the SpeechSynthesisUtterance and the endListener so that we can remove the listener later.
    // Notice this is used in the function scopes above.
    // IMPORTANT NOTE: Also, this acts as a workaround for a Safari bug where the `end` event does not fire
    // consistently. If the SpeechSynthesisUtterance is not in memory when it is time for the `end` event, Safari
    // will fail to emit that event. See
    // https://stackoverflow.com/questions/23483990/speechsynthesis-api-onend-callback-not-working and
    // https://github.com/phetsims/john-travoltage/issues/435 and https://github.com/phetsims/utterance-queue/issues/52
    const speechSynthesisUtteranceWrapper = new SpeechSynthesisUtteranceWrapper( utterance, announceText, speechSynthUtterance, endListener );

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

    // Utterance is pending until we get a successful 'start' event on the SpeechSynthesisUtterance
    this.pendingSpeechSynthesisUtteranceWrapper = speechSynthesisUtteranceWrapper;

    this.getSynth()!.speak( speechSynthUtterance );
  }

  /**
   * When a canAnnounceProperty changes to false for an Utterance, that utterances should be cancelled.
   */
  private handleCanAnnounceChange( canAnnounce: boolean ): void {
    if ( !canAnnounce ) {
      assert && assert( this.currentlySpeakingUtterance, 'Listener requires an announcing Utterance to cancel.' );
      this.cancelUtterance( this.currentlySpeakingUtterance! );
    }
  }

  /**
   * All the work necessary when we are finished with an utterance, intended for end or cancel.
   * Emits events signifying that we are done with speech and does some disposal.
   */
  private handleSpeechSynthesisEnd( stringToSpeak: ResolvedResponse, speechSynthesisUtteranceWrapper: SpeechSynthesisUtteranceWrapper ): void {
    this.endSpeakingEmitter.emit( stringToSpeak, speechSynthesisUtteranceWrapper.utterance );
    this.announcementCompleteEmitter.emit( speechSynthesisUtteranceWrapper.utterance, speechSynthesisUtteranceWrapper.speechSynthesisUtterance.text );

    speechSynthesisUtteranceWrapper.speechSynthesisUtterance.removeEventListener( 'end', speechSynthesisUtteranceWrapper.endListener );

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
    this.pendingSpeechSynthesisUtteranceWrapper = null;
    this.currentlySpeakingUtterance = null;
  }

  /**
   * Returns a references to the SpeechSynthesis of the voicingManager that is used to request speech with the Web
   * Speech API. Every references has a check to ensure that the synth is available.
   */
  private getSynth(): null | SpeechSynthesis {
    assert && assert( SpeechSynthesisAnnouncer.isSpeechSynthesisSupported(), 'Trying to use SpeechSynthesis, but it is not supported on this platform.' );
    return this.synth;
  }

  /**
   * Stops any Utterance that is currently being announced or is pending.
   * (utterance-queue internal)
   */
  public cancel(): void {
    if ( this.initialized ) {
      const utteranceToCancel = this.speakingSpeechSynthesisUtteranceWrapper ? this.speakingSpeechSynthesisUtteranceWrapper.utterance :
                                this.pendingSpeechSynthesisUtteranceWrapper ? this.pendingSpeechSynthesisUtteranceWrapper.utterance :
                                null;

      if ( utteranceToCancel ) {
        this.cancelUtterance( utteranceToCancel );
      }
    }
  }

  /**
   * Cancel the provided Utterance, if it is currently being spoken by this Announcer. Does not cancel
   * any other utterances that may be in the UtteranceQueue.
   * (utterance-queue internal)
   */
  public override cancelUtterance( utterance: Utterance ): void {
    const utteranceWrapperToEnd = utterance === this.currentlySpeakingUtterance ? this.speakingSpeechSynthesisUtteranceWrapper :
                                  ( this.pendingSpeechSynthesisUtteranceWrapper && utterance === this.pendingSpeechSynthesisUtteranceWrapper.utterance ) ? this.pendingSpeechSynthesisUtteranceWrapper :
                                  null;

    if ( utteranceWrapperToEnd ) {
      this.handleSpeechSynthesisEnd( utteranceWrapperToEnd.announceText, utteranceWrapperToEnd );

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

    // test against what is currently being spoken by the synth (currentlySpeakingUtterance)
    if ( this.currentlySpeakingUtterance && this.shouldUtteranceCancelOther( nextAvailableUtterance, this.currentlySpeakingUtterance ) ) {
      this.cancelUtterance( this.currentlySpeakingUtterance );
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
   * voicingManager. On platforms where speechSynthesis is available, all features of it are available, with the
   * exception of the onvoiceschanged event in a couple of platforms. However, the listener can still be set
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
                      public readonly endListener: () => void ) {
  }
}

type HimalayaElement = {
  type: string;
  tagName: string;
};
/**
 * @param element - returned from himalaya parser, see documentation for details.
 */
const isNotBrTag = ( element: HimalayaElement ): boolean => !( element.type.toLowerCase() === 'element' && element.tagName.toLowerCase() === 'br' );

/**
 * Remove <br> or <br/> tags from a string
 * @param string - plain text or html string
 */
function removeBrTags( string: string ): string {

  // @ts-ignore - factor out usages of global to a single spot for one ts-ignore
  const parser = himalaya;

  if ( parser ) {
    const parsedAndFiltered = parser.parse( string ).filter( isNotBrTag );
    return parser.stringify( parsedAndFiltered );
  }
  return string;
}

utteranceQueueNamespace.register( 'SpeechSynthesisAnnouncer', SpeechSynthesisAnnouncer );
export default SpeechSynthesisAnnouncer;