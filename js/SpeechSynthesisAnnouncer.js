// Copyright 2020-2022, University of Colorado Boulder

/**
 * Uses the Web Speech API to produce speech from the browser. This is a prototype, DO NOT USE IN PRODUCTION CODE.
 * There is no speech output until the voicingManager has been initialized. Supported voices will depend on platform.
 * For each voice, you can customize the rate and pitch. Only one voicingManager should be active at a time and so this
 * type is a singleton.
 *
 * @author Jesse Greenberg
 */

import BooleanProperty from '../../axon/js/BooleanProperty.js';
import DerivedProperty from '../../axon/js/DerivedProperty.js';
import Emitter from '../../axon/js/Emitter.js';
import EnabledComponent from '../../axon/js/EnabledComponent.js';
import NumberProperty from '../../axon/js/NumberProperty.js';
import Property from '../../axon/js/Property.js';
import Range from '../../dot/js/Range.js';
import merge from '../../phet-core/js/merge.js';
import stripEmbeddingMarks from '../../phet-core/js/stripEmbeddingMarks.js';
import Announcer from '../../utterance-queue/js/Announcer.js';
import Utterance from '../../utterance-queue/js/Utterance.js';
import utteranceQueueNamespace from './utteranceQueueNamespace.js';

// In ms, how frequently we will use SpeechSynthesis to keep the feature active. After long intervals without
// using SpeechSynthesis Chromebooks will take a long time to produce the next speech. Presumably it is disabling
// the feature as an optimization. But this workaround gets around it and keeps speech fast.
const ENGINE_WAKE_INTERVAL = 10000;

// In ms. In Safari, the `start` and `end` listener do not fire consistently, especially after interruption
// with cancel. But speaking behind a timeout/delay improves the behavior significantly. Timeout of 250 ms was
// determined with testing to be a good value to use. Values less than 250 broke the workaround, while larger
// values feel too sluggish. See https://github.com/phetsims/john-travoltage/issues/435
// Beware that UtteranceQueueTests use this value too. Don't change without checking those tests.
const VOICING_UTTERANCE_INTERVAL = 250;

const UTTERANCE_OPTION_DEFAULTS = {

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

class SpeechSynthesisAnnouncer extends Announcer {
  constructor() {
    super( {

      // {boolean} - All VoicingManager instances should respect responseCollector's current state.
      respectResponseCollectorProperties: true
    } );

    // @public {null|SpeechSynthesisVoice}
    this.voiceProperty = new Property( null );

    // @public {NumberProperty} - controls the speaking rate of Web Speech
    this.voiceRateProperty = new NumberProperty( 1.0, { range: new Range( 0.75, 2 ) } );

    // @public {NumberProperty} - controls the pitch of the synth
    this.voicePitchProperty = new NumberProperty( 1.0, { range: new Range( 0.5, 2 ) } );

    // @public {NumberProperty} - Controls volume of the synth. Intended for use with unit tests only!!
    this.voiceVolumeProperty = new NumberProperty( 1.0, { range: new Range( 0, 1 ) } );

    // @private {boolean} - Indicates whether or not speech using SpeechSynthesis has been requested at least once.
    // The first time speech is requested, it must be done synchronously from user input with absolutely no delay.
    // requestSpeech() generally uses a timeout to workaround browser bugs, but those cannot be used until after the
    // first request for speech.
    this.hasSpoken = false;

    // @private {number} - In ms, how long to go before "waking the SpeechSynthesis" engine to keep speech
    // fast on Chromebooks, see documentation around ENGINE_WAKE_INTERVAL.
    this.timeSinceWakingEngine = 0;

    // @private {number} - Amount of time in ms to wait between speaking SpeechSynthesisUtterances, see
    // VOICING_UTTERANCE_INTERVAL for details about why this is necessary. Initialized to the interval value
    // so that we can speak instantly the first time.
    this.timeSinceUtteranceEnd = VOICING_UTTERANCE_INTERVAL;

    // @public {Emitter} - emits events when the speaker starts/stops speaking, with the Utterance that is
    // either starting or stopping
    this.startSpeakingEmitter = new Emitter( { parameters: [ { valueType: 'string' }, { valueType: Utterance } ] } );
    this.endSpeakingEmitter = new Emitter( { parameters: [ { valueType: 'string' }, { valueType: Utterance } ] } );

    // @public {Emitter} - emits whenever the voices change for SpeechSynthesis
    this.voicesChangedEmitter = new Emitter();

    // @private - To get around multiple inheritance issues, create enabledProperty via composition instead, then create
    // a reference on this component for the enabledProperty
    this.enabledComponentImplementation = new EnabledComponent( {

      // initial value for the enabledProperty, false because speech should not happen until requested by user
      enabled: false,

      // phet-io
      phetioEnabledPropertyInstrumented: false
    } );

    // @public
    this.enabledProperty = this.enabledComponentImplementation.enabledProperty;

    // @public {BooleanProperty} - Controls whether Voicing is enabled in a "main window" area of the application.
    // This supports the ability to disable Voicing for the important screen content of your application while keeping
    // Voicing for surrounding UI components enabled (for example).
    this.mainWindowVoicingEnabledProperty = new BooleanProperty( true );

    // @public {DerivedProperty.<Boolean>} - Property that indicates that the Voicing feature is enabled for all areas
    // of the application.
    this.voicingFullyEnabledProperty = DerivedProperty.and( [ this.enabledProperty, this.mainWindowVoicingEnabledProperty ] );

    // @public {BooleanProperty} - Indicates whether speech is fully enabled AND speech is allowed, as specified
    // by the Property provided in initialize(). See speechAllowedProperty of initialize(). In order for this Property
    // to be true, speechAllowedProperty, enabledProperty, and mainWindowVoicingEnabledProperty must all be true.
    // Initialized in the constructor because we don't have access to all the dependency Properties until initialize.
    this.speechAllowedAndFullyEnabledProperty = new BooleanProperty( false );

    // @private {SpeechSynthesis|null} - synth from Web Speech API that drives speech, defined on initialize
    this._synth = null;

    // @public {SpeechSynthesisVoice[]} - possible voices for Web Speech synthesis
    this.voices = [];

    // @private {SpeechSynthesisUtteranceWrapper|null} - A references is kept so that we can remove listeners
    // from the SpeechSynthesisUtterance when the voicingManager finishes speaking the Utterance.
    this.speakingSpeechSynthesisUtteranceWrapper = null;

    // @public {boolean} - is the VoicingManager initialized for use? This is prototypal so it isn't always initialized
    this.initialized = false;

    // @private {Property|DerivedProperty|null} - Controls whether or not speech is allowed with synthesis.
    // Null until initialized, and can be set by options to initialize().
    this._canSpeakProperty = null;

    // @private {function} - bound so we can link and unlink to this.canSpeakProperty when the voicingManager becomes
    // initialized.
    this.boundHandleCanSpeakChange = this.handleCanSpeakChange.bind( this );

    // @public {Utterance|null} - Only public for unit tests! A reference to the utterance currently in the synth
    // being spoken by the browser, so we can determine cancelling behavior when it is time to speak the next utterance.
    // See voicing's supported announcerOptions for details.
    this.currentlySpeakingUtterance = null;
  }

  /**
   * Indicate that the voicingManager is ready for use, and attempt to populate voices (if they are ready yet). Adds
   * listeners that control speech.
   * @public
   *
   * @param {Emitter} userGestureEmitter - Emits when a user gesture happens, which is required before the browser is
   *                                       allowed to use SpeechSynthesis.
   * @param {Object} [options]
   */
  initialize( userGestureEmitter, options ) {
    assert && assert( this.initialized === false, 'can only be initialized once' );
    assert && assert( this.isSpeechSynthesisSupported(), 'trying to initialize speech, but speech is not supported on this platform.' );

    options = merge( {

      // {BooleanProperty|DerivedProperty.<boolean>} - Controls whether speech is allowed with speech synthesis.
      // Combined into another DerivedProperty with this.enabledProperty so you don't have to use that as one
      // of the Properties that derive speechAllowedProperty, if you are passing in a DerivedProperty.
      speechAllowedProperty: new BooleanProperty( true )
    }, options );

    this._synth = window.speechSynthesis;

    // whether the optional Property indicating speech is allowed and the voicingManager is enabled
    this._canSpeakProperty = DerivedProperty.and( [ options.speechAllowedProperty, this.enabledProperty ] );
    this._canSpeakProperty.link( this.boundHandleCanSpeakChange );

    // Set the speechAllowedAndFullyEnabledProperty when dependency Properties update
    Property.multilink(
      [ options.speechAllowedProperty, this.voicingFullyEnabledProperty ],
      ( speechAllowed, voicingFullyEnabled ) => {
        this.speechAllowedAndFullyEnabledProperty.value = speechAllowed && voicingFullyEnabled;
      } );

    // browsers tend to generate the list of voices lazily, so the list of voices may be empty until speech is
    // first requested
    this.getSynth().onvoiceschanged = () => {
      this.populateVoices();
    };

    // try to populate voices immediately in case the browser populates them eagerly and we never get an
    // onvoiceschanged event
    this.populateVoices();

    // The control key will stop the synth from speaking if there is an active utterance. This key was decided because
    // most major screen readers will stop speech when this key is pressed
    // TODO: Move this to the phet/scenery specific voicingManager so that we can use globalKeyStateTracker, see https://github.com/phetsims/utterance-queue/issues/34
    // globalKeyStateTracker.keyupEmitter.addListener( domEvent => {
    //   if ( KeyboardUtils.isControlKey( domEvent ) ) {
    //     this.cancel();
    //   }
    // } );

    // To get Voicing to happen quickly on Chromebooks we set the counter to a value that will trigger the "engine
    // wake" interval on the next animation frame the first time we get a user gesture. See ENGINE_WAKE_INTERVAL
    // for more information about this workaround.
    const startEngineListener = () => {
      this.timeSinceWakingEngine = ENGINE_WAKE_INTERVAL;

      // Display is on the namespace but cannot be imported due to circular dependencies
      userGestureEmitter.removeListener( startEngineListener );
    };
    userGestureEmitter.addListener( startEngineListener );

    this.initialized = true;
  }

  /**
   * @override
   * @public
   * @param {number} dt - in milliseconds (not seconds)!
   * @param {UtteranceWrapper[]} queue
   */
  step( dt, queue ) {

    if ( this.initialized ) {

      // Increment the amount of time since the synth has stopped speaking the previous utterance, but don't
      // start counting up until the synth has finished speaking its current utterance.
      this.timeSinceUtteranceEnd = this.getSynth().speaking ? 0 : this.timeSinceUtteranceEnd + dt;

      // Wait until VOICING_UTTERANCE_INTERVAL to speak again for more consistent behavior on certain platforms,
      // see documentation for the constant for more information. By setting readyToAnnounce in the step function
      // we also don't have to rely at all on the SpeechSynthesisUtterance 'end' event, which is inconsistent on
      // certain platforms.
      if ( this.timeSinceUtteranceEnd > VOICING_UTTERANCE_INTERVAL ) {
        this.readyToAnnounce = true;
      }

      // A workaround to keep SpeechSynthesis responsive on Chromebooks. If there is a long enough interval between
      // speech requests, the next time SpeechSynthesis is used it is very slow on Chromebook. We think the browser
      // turns "off" the synthesis engine for performance. If it has been long enough since using speech synthesis and
      // there is nothing to speak in the queue, requesting speech with empty content keeps the engine active.
      // See https://github.com/phetsims/gravity-force-lab-basics/issues/303.
      this.timeSinceWakingEngine += dt;
      if ( !this.getSynth().speaking && queue.length === 0 && this.timeSinceWakingEngine > ENGINE_WAKE_INTERVAL ) {
        this.timeSinceWakingEngine = 0;
        this.getSynth().speak( new SpeechSynthesisUtterance( '' ) );
      }
    }
  }

  /**
   * When we can no longer speak, cancel all speech to silence everything.
   * @private
   *
   * @param {boolean} canSpeak
   */
  handleCanSpeakChange( canSpeak ) {
    if ( !canSpeak ) { this.cancel(); }
  }

  /**
   * Update the list of voices available to the synth, and notify that the list has changed.
   * @private
   */
  populateVoices() {

    // the browser sometimes provides duplicate voices, prune those out of the list
    this.voices = _.uniqBy( this.getSynth().getVoices(), voice => voice.name );
    this.voicesChangedEmitter.emit();
  }

  /**
   * Returns an array of SpeechSynthesisVoices that are sorted such that the best sounding voices come first.
   * As of 9/27/21, we find that the "Google" voices sound best while Apple's "Fred" sounds the worst so the list
   * will be ordered to reflect that. This way "Google" voices will be selected by default when available and "Fred"
   * will almost never be the default Voice since it is last in the list. See
   * https://github.com/phetsims/scenery/issues/1282/ for discussion and this decision.
   * @public
   *
   * @returns {SpeechSynthesisVoice[]}
   */
  getPrioritizedVoices() {
    assert && assert( this.initialized, 'No voices available until the voicingManager is initialized' );
    assert && assert( this.voices.length > 0, 'No voices available to provided a prioritized list.' );

    const voices = this.voices.slice();

    const getIndex = voice =>
      voice.name.includes( 'Google' ) ? -1 : // Google should move toward the front
      voice.name.includes( 'Fred' ) ? voices.length : // Fred should move toward the back
      voices.indexOf( voice ); // Otherwise preserve ordering

    return voices.sort( ( a, b ) => getIndex( a ) - getIndex( b ) );

  }

  /**
   * Implements announce so the voicingManager can be a source of output for utteranceQueue.
   * @public
   * @override
   *
   * @param {Utterance} utterance
   * @param {Object} [options]
   */
  announce( utterance, options ) {
    if ( this.initialized ) {
      this.speak( utterance );
    }
  }

  /**
   * Use speech synthesis to speak an utterance. No-op unless voicingManager is initialized and enabled and
   * other output controlling Properties are true (see speechAllowedProperty in initialize()).
   * @public
   *
   * @param {Utterance} utterance
   */
  speak( utterance ) {
    if ( this.initialized && this._canSpeakProperty.value ) {
      this.requestSpeech( utterance );
    }
  }

  /**
   * Use speech synthesis to speak an utterance. No-op unless voicingManager is initialized and other output
   * controlling Properties are true (see speechAllowedProperty in initialize()). This explicitly ignores
   * this.enabledProperty, allowing speech even when voicingManager is disabled. This is useful in rare cases, for
   * example when the voicingManager recently becomes disabled by the user and we need to announce confirmation of
   * that decision ("Voicing off" or "All audio off").
   *
   * @public
   *
   * @param {Utterance} utterance
   */
  speakIgnoringEnabled( utterance ) {
    if ( this.initialized ) {
      this.requestSpeech( utterance );
    }
  }

  /**
   * Request speech with SpeechSynthesis.
   * @private
   *
   * @param {Utterance} utterance
   */
  requestSpeech( utterance ) {
    assert && assert( this.isSpeechSynthesisSupported(), 'trying to speak with speechSynthesis, but it is not supported on this platform' );

    // embedding marks (for i18n) impact the output, strip before speaking
    const stringToSpeak = removeBrTags( stripEmbeddingMarks( utterance.getTextToAlert( this.respectResponseCollectorProperties ) ) );
    const speechSynthUtterance = new SpeechSynthesisUtterance( stringToSpeak );
    speechSynthUtterance.voice = this.voiceProperty.value;
    speechSynthUtterance.pitch = this.voicePitchProperty.value;
    speechSynthUtterance.rate = this.voiceRateProperty.value;
    speechSynthUtterance.volume = this.voiceVolumeProperty.value;

    const startListener = () => {
      this.startSpeakingEmitter.emit( stringToSpeak, utterance );
      this.currentlySpeakingUtterance = utterance;

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
    const speechSynthesisUtteranceWrapper = new SpeechSynthesisUtteranceWrapper( utterance, speechSynthUtterance, endListener );

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

    this.getSynth().speak( speechSynthUtterance );

    if ( !this.hasSpoken ) {
      this.hasSpoken = true;
    }
  }

  /**
   * All the work necessary when we are finished with an utterance, intended for end or cancel.
   * Emits events signifying that we are done with speech and does some disposal.
   * @private
   *
   * @param {string} stringToSpeak
   * @param {SpeechSynthesisUtteranceWrapper} speechSynthesisUtteranceWrapper
   */
  handleSpeechSynthesisEnd( stringToSpeak, speechSynthesisUtteranceWrapper ) {
    this.endSpeakingEmitter.emit( stringToSpeak, speechSynthesisUtteranceWrapper.utterance );
    this.announcementCompleteEmitter.emit( speechSynthesisUtteranceWrapper.utterance );

    speechSynthesisUtteranceWrapper.speechSynthesisUtterance.removeEventListener( 'end', speechSynthesisUtteranceWrapper.endListener );

    this.speakingSpeechSynthesisUtteranceWrapper = null;
    this.currentlySpeakingUtterance = null;
  }

  /**
   * Returns true if SpeechSynthesis is available on the window. This check is sufficient for all of
   * voicingManager. On platforms where speechSynthesis is available, all features of it are available, with the
   * exception of the onvoiceschanged event in a couple of platforms. However, the listener can still be set
   * without issue on those platforms so we don't need to check for its existence. On those platforms, voices
   * are provided right on load.
   * @public
   *
   * @returns {boolean}
   */
  isSpeechSynthesisSupported() {
    return !!window.speechSynthesis && !!window.SpeechSynthesisUtterance;
  }

  /**
   * Returns a references to the SpeechSynthesis of the voicingManager that is used to request speech with the Web
   * Speech API. Every references has a check to ensure that the synth is available.
   * @private
   *
   * @returns {null|SpeechSynthesis}
   */
  getSynth() {
    assert && assert( this.isSpeechSynthesisSupported(), 'Trying to use SpeechSynthesis, but it is not supported on this platform.' );
    return this._synth;
  }

  /**
   * Stops any Utterance that is currently being announced.
   * @public (utterance-queue internal)
   */
  cancel() {
    if ( this.initialized ) {

      if ( this.currentlySpeakingUtterance ) {
        this.cancelUtterance( this.currentlySpeakingUtterance );
      }
    }
  }

  /**
   * Cancel the provided Utterance, if it is currently being spoken by this Announcer. Does not cancel
   * any other utterances that may be in the UtteranceQueue.
   * @override
   * @public (utterance-queue internal)
   *
   * @param {Utterance} utterance
   */
  cancelUtterance( utterance ) {
    if ( this.currentlySpeakingUtterance === utterance ) {

      // eagerly remove the end event, the browser can emit this asynchronously and we do not want to get
      // the end event after we have finished speaking and it has been removed from the queue
      if ( this.speakingSpeechSynthesisUtteranceWrapper ) {
        this.handleSpeechSynthesisEnd( utterance.getAlertText(), this.speakingSpeechSynthesisUtteranceWrapper );
      }

      // silence all speech - after handleSpeechSynthesisEnd so we don't do that work twice in case the end
      // event is synchronous on this browser
      this.cancelSynth();
    }
  }

  /**
   * Given one utterance, should it cancel another provided utterance?
   * @param {Utterance} utterance
   * @param {Utterance} utteranceToCancel
   * @returns {boolean}
   * @public
   */
  shouldUtteranceCancelOther( utterance, utteranceToCancel ) {
    assert && assert( utterance instanceof Utterance );
    assert && assert( utteranceToCancel instanceof Utterance );

    const utteranceOptions = merge( {}, UTTERANCE_OPTION_DEFAULTS, utterance.announcerOptions );

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
   * @public
   *
   * @param {Utterance} nextAvailableUtterance
   */
  onUtterancePriorityChange( nextAvailableUtterance ) {

    // test against what is currently being spoken by the synth (currentlySpeakingUtterance)
    if ( this.currentlySpeakingUtterance && this.shouldUtteranceCancelOther( nextAvailableUtterance, this.currentlySpeakingUtterance ) ) {
      this.cancelUtterance( this.currentlySpeakingUtterance );
    }
  }

  /**
   * Cancel the synth. This will silence speech. This will silence any speech and cancel the
   * @private
   */
  cancelSynth() {
    assert && assert( this.initialized, 'must be initialized to use synth' );
    this.getSynth().cancel();
  }
}

/**
 * An inner class that combines some objects that are necessary to keep track of to dispose
 * SpeechSynthesisUtterances when it is time. It is also used for the "Safari Workaround" to keep a reference
 * of the SpeechSynthesisUtterance in memory long enough for the 'end' event to be emitted.
 */
class SpeechSynthesisUtteranceWrapper {
  constructor( utterance, speechSynthesisUtterance, endListener ) {
    this.utterance = utterance;
    this.speechSynthesisUtterance = speechSynthesisUtterance;
    this.endListener = endListener;
  }
}

/**
 * @param {Object} element - returned from himalaya parser, see documentation for details.
 * @returns {boolean}
 */
const isNotBrTag = element => !( element.type.toLowerCase() === 'element' && element.tagName.toLowerCase() === 'br' );

/**
 * Remove <br> or <br/> tags from a string
 * @param {string} string - plain text or html string
 * @returns {string}
 */
function removeBrTags( string ) {
  const parsedAndFiltered = himalaya.parse( string ).filter( isNotBrTag );
  return himalaya.stringify( parsedAndFiltered );
}

utteranceQueueNamespace.register( 'SpeechSynthesisAnnouncer', SpeechSynthesisAnnouncer );
export default SpeechSynthesisAnnouncer;