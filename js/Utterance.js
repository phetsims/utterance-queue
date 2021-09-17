// Copyright 2019-2021, University of Colorado Boulder

/**
 * An utterance to be handed off to the AlertQueue, which manages the order of accessibility alerts
 * read by a screen reader.
 *
 * An utterance to be provided to the AlertQueue. An utterance can be one of AlertableDef or an array of items
 * that conform to AlertableDef. If using an array, alertables in the array will be anounced in order (one at a time)
 * each time this utterances is added to the utteranceQueue.
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

import validate from '../../axon/js/validate.js';
import merge from '../../phet-core/js/merge.js';
import AlertableDef from './AlertableDef.js';
import responseCollector from './responseCollector.js';
import ResponsePacket from './ResponsePacket.js';
import utteranceQueueNamespace from './utteranceQueueNamespace.js';

// constants
// {string|Array.<string>}
const ALERT_VALIDATOR = {
  isValidValue: v => AlertableDef.isAlertableDef( v ) && !( v instanceof Utterance )
};

let globalIdCounter = 1;


class Utterance {

  /**
   * @param {Object} [options]
   */
  constructor( options ) {
    options = merge( {

      /**
       * The content of the alert that this Utterance is wrapping. If it is an array, then the Utterance will
       * keep track of number of times that the Utterance has been alerted, and choose from the list "accordingly" see
       * loopingSchema for more details
       * {string|Array.<string>}
       */
      alert: null,

      // if true, then the alert must be of type {Array.<string>}, and alerting will cycle through each alert, and then wrap back
      // to the beginning when complete. The default behavior (loopAlerts:false) is to repeat the last alert in the array until reset.
      loopAlerts: false,

      // @returns {boolean} - if predicate returns false, the alert content associated
      // with this utterance will not be announced by a screen reader
      predicate: function() { return true; },

      // {number} - in ms, how long to wait before the utterance is considered "stable" and stops being
      // added to the queue, at which point it will be spoken. Default value chosen because
      // it sounds nice in most usages of Utterance with alertStableDelay. If you want to hear the utterance as fast
      // as possible, reduce this delay to 0. See https://github.com/phetsims/scenery-phet/issues/491
      alertStableDelay: 200,

      // {number} - if specified, the utterance will be spoken at least this frequently in ms
      // even if the utterance is continuously added to the queue and never becomes "stable"
      alertMaximumDelay: Number.MAX_VALUE,

      // Options specific to the announcer of the Utterance. See supported options in your specific announcer's
      // announce() function (for example AriaHerald.announce())
      announcerOptions: {}
    }, options );

    assert && assert( typeof options.loopAlerts === 'boolean' );
    assert && assert( typeof options.predicate === 'function' );
    assert && assert( typeof options.alertStableDelay === 'number' );
    assert && assert( typeof options.alertMaximumDelay === 'number' );
    assert && options.alert && assert( AlertableDef.isAlertableDef( options.alert ) );
    assert && options.alert && options.loopAlerts && assert( Array.isArray( options.alert ),
      'if loopAlerts is provided, options.alert must be an array' );

    this.id = globalIdCounter++;

    // @private
    this._alert = options.alert;
    this.loopAlerts = options.loopAlerts;

    // @public (read-only) - keep track of the number of times alerted, this will dictate which alert string to use if
    // the alert is an array of strings. Reset each time that the alert changed.
    this.numberOfTimesAlerted = 0;

    // @public (read-only, scenery-phet-internal)
    this.predicate = options.predicate;

    // @public (read-only, scenery-phet-internal) {number} - In ms, how long the utterance should remain in the queue
    // before it is read. The queue is cleared in FIFO order, but utterances are skipped until the delay time is less
    // than the amount of time the utterance has been in the queue
    this.alertStableDelay = options.alertStableDelay;

    // @public {scenery-phet-internal, read-only} {number}- in ms, the maximum amount of time that should
    // pass before this alert should be spoken, even if the utterance is rapidly added to the queue
    // and is not quite "stable"
    this.alertMaximumDelay = options.alertMaximumDelay;

    // @public (utterance-queue-internal) - Options to be passed to the announcer for this Utterance
    this.announcerOptions = options.announcerOptions;
  }

  /**
   *
   * @param {ResponsePacket} alert
   * @param {boolean} respectResponseCollectorProperties - if false, then do not listen to the value of responseCollector
   *                                              for creating the ResponsePacket conglomerate (just combine all available).
   * @private
   */
  getAlertStringFromResponsePacket( alert, respectResponseCollectorProperties ) {
    assert && assert( alert instanceof ResponsePacket );

    const responsePacketOptions = _.extend( {}, alert ); // eslint-disable-line bad-sim-text

    if ( !respectResponseCollectorProperties ) {
      responsePacketOptions.ignoreProperties = true;
    }
    return responseCollector.collectResponses( responsePacketOptions );
  }

  /**
   * Get the string to alert, with no side effects
   * @public
   * @param {boolean} respectResponseCollectorProperties=false - if false, then do not listen to the value of responseCollector
   *                                              for creating the ResponsePacket conglomerate (just combine all that are supplied).
   * @returns {string}
   */
  getAlertText( respectResponseCollectorProperties = false ) {
    let alert;
    if ( typeof this._alert === 'string' || this._alert instanceof ResponsePacket ) {
      alert = this._alert;
    }
    else if ( this.loopAlerts ) {
      alert = this._alert[ this.numberOfTimesAlerted % this._alert.length ];
    }
    else {
      assert && assert( Array.isArray( this._alert ) ); // sanity check
      const currentAlertIndex = Math.min( this.numberOfTimesAlerted, this._alert.length - 1 );
      alert = this._alert[ currentAlertIndex ];
    }

    // Support if ResponsePacket is inside an array alert
    if ( alert instanceof ResponsePacket ) {
      alert = this.getAlertStringFromResponsePacket( alert, respectResponseCollectorProperties );
    }

    return alert;
  }

  /**
   * Getter for the text to be alerted for this Utterance. This should only be called when the alert is about to occur
   * because Utterance updates the number of times it has alerted based on this function, see this.numberOfTimesAlerted
   * @param {boolean} respectResponseCollectorProperties - if false, then do not listen to the value of responseCollector
   *                                              for creating the ResponsePacket conglomerate (just combine all available).
   * @returns {string}
   * @public (UtteranceQueue only)
   */
  getTextToAlert( respectResponseCollectorProperties ) {
    const alert = this.getAlertText( respectResponseCollectorProperties );
    this.numberOfTimesAlerted++; // TODO: this should be called incremented by utteranceQueue directly, so that this could just be a normal getter function, see https://github.com/phetsims/utterance-queue/issues/2
    return alert;
  }

  /**
   * Set the alert for the utterance
   * @param {string|Array.<string>} alert
   * @public
   */
  set alert( alert ) {
    // NOTE: don't guard against alert being different, in case the array is the same, but with a mutated Array, see https://github.com/phetsims/friction/issues/214

    validate( alert, ALERT_VALIDATOR );
    this.numberOfTimesAlerted = 0;

    this._alert = alert;
  }

  /**
   * @public
   * @returns {null|string|Array.<string>}
   */
  get alert() {
    return this._alert;
  }

  /**
   * Set the alertStableDelay time, see alertStableDelay option for more information.
   *
   * BEWARE! Why does the delay time need to be changed during the lifetime of an Utterance? It did for
   * https://github.com/phetsims/gravity-force-lab-basics/issues/146, but does it for you? Be sure there is good
   * reason changing this value.
   * @public
   *
   * @param {number} delay
   */
  setAlertStableDelay( delay ) {
    this.alertStableDelay = delay;
  }

  /**
   * @public
   * @returns {string}
   */
  toString() {
    return `Utterance_${this.id}#${this.getAlertText()}`;
  }

  /**
   * @public
   */
  reset() {
    this.numberOfTimesAlerted = 0;
  }
}

utteranceQueueNamespace.register( 'Utterance', Utterance );
export default Utterance;