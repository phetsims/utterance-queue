// Copyright 2019-2020, University of Colorado Boulder

/**
 * Manages a queue of Utterances that are read in order by assistive technology (AT). This queue typically reads
 * things in a first-in-first-out manner, but it is possible to send an alert directly to the front of
 * the queue. Items in the queue are sent to AT front to back, driven by AXON/timer.
 *
 * AT are inconsistent in the way that they order alerts, some use last-in-first-out order,
 * others use first-in-first-out order, others just read the last alert that was provided. This queue
 * manages order and improves consistency.
 *
 * @author Jesse Greenberg (PhET Interactive Simulations)
 * @author Michael Kauzmann (PhET Interactive Simulations)
 */

import stepTimer from '../../axon/js/stepTimer.js';
import merge from '../../phet-core/js/merge.js';
import PhetioObject from '../../tandem/js/PhetioObject.js';
import Tandem from '../../tandem/js/Tandem.js';
import BooleanIO from '../../tandem/js/types/BooleanIO.js';
import IOType from '../../tandem/js/types/IOType.js';
import StringIO from '../../tandem/js/types/StringIO.js';
import VoidIO from '../../tandem/js/types/VoidIO.js';
import AlertableDef from './AlertableDef.js';
import AriaHerald from './AriaHerald.js';
import Utterance from './Utterance.js';
import utteranceQueueNamespace from './utteranceQueueNamespace.js';

class UtteranceQueue extends PhetioObject {

  /**
   * @param {Object} announcer - The output implementation for the utteranceQueue, must implement an announce function
   *                             which requests speech in some way (such as the Web Speech API or aria-live)
   * @param {boolean} implementAsSkeleton=false - if true, all functions will be no ops. Used to support runtimes
   *                                               that don't use aria-live as well as those that do. When true this
   *                                               type will not be instrumented for PhET-iO either.
   * @param {Object} [options]
   */
  constructor( announcer, implementAsSkeleton = false, options ) {
    assert && assert( announcer && typeof announcer.announce === 'function', 'a function announce must be implemented on announcer' );

    options = merge( {

      // phet-io
      tandem: Tandem.OPTIONAL,
      phetioType: UtteranceQueue.UtteranceQueueIO,
      phetioState: false
    }, options );

    // If just a skeleton, then we don't instrument this
    if ( implementAsSkeleton ) {
      options.tandem = Tandem.OPT_OUT;
    }

    super( options );

    // @private - implements announcer.announce, which actually sends browser requests
    // to speak either through aria-herald with a screen reader, speech synthesis with
    // Web Speech API or perhaps some other method in the future
    this.announcer = announcer;

    // @private {boolean} initialization is like utteranceQueue's constructor. No-ops all around if not
    // initialized (cheers). See initialize();
    this._initialized = !implementAsSkeleton;

    // @public (tests) {Array.<Utterance>} - array of Utterances, spoken in first to last order
    this.queue = [];

    // whether or not Utterances moving through the queue are read by a screen reader
    this._muted = false;

    // whether the UtterancesQueue is alerting, and if you can add/remove utterances
    this._enabled = true;

    if ( this._initialized ) {

      // @private {function}
      this.stepQueueListener = this.stepQueue.bind( this );

      // begin stepping the queue
      stepTimer.addListener( this.stepQueueListener );
    }
  }

  /**
   * Get the HTMLElement that houses all aria-live elements needed for the utterance queue to alert.
   * @public
   * @returns {HTMLDivElement}
   */
  getAriaLiveContainer() {
    assert && assert( this.announcer );
    assert && assert( this.announcer.ariaLiveContainer );
    return this.announcer.ariaLiveContainer;
  }

  /**
   * Add an utterance ot the end of the queue.  If the utterance has a type of alert which
   * is already in the queue, the older alert will be immediately removed.
   *
   * @public
   * @param {AlertableDef} utterance
   */
  addToBack( utterance ) {
    assert && assert( AlertableDef.isAlertableDef( utterance ), `trying to alert something that isn't alertable: ${utterance}` );

    // No-op if the utteranceQueue is disabled
    if ( !this.initializedAndEnabled ) {
      return;
    }

    utterance = this.prepareUtterance( utterance );
    this.queue.push( utterance );
  }

  /**
   * Convenience function to help with nullable values. No-op if null or nothing is passed in
   * @public
   * @param {null|AlertableDef} [utterance]
   */
  addToBackIfDefined( utterance ) {
    if ( utterance !== null && utterance !== undefined ) {
      assert && assert( AlertableDef.isAlertableDef( utterance ), `trying to alert something that isn't alertable: ${utterance}` );

      this.addToBack( utterance );
    }
  }

  /**
   * Add an utterance to the front of the queue to be read immediately.
   * @public
   * @param {AlertableDef} utterance
   */
  addToFront( utterance ) {
    assert && assert( AlertableDef.isAlertableDef( utterance ), `trying to alert something that isn't alertable: ${utterance}` );

    // No-op function if the utteranceQueue is disabled
    if ( !this.initializedAndEnabled ) {
      return;
    }

    utterance = this.prepareUtterance( utterance );
    this.queue.unshift( utterance );
  }

  /**
   * Create an Utterance for the queue in case of string and clears the queue of duplicate utterances.
   * @private
   *
   * @param {AlertableDef} utterance
   * @returns {Utterance}
   */
  prepareUtterance( utterance ) {
    if ( typeof utterance === 'string' ) {
      utterance = new Utterance( { alert: utterance } );
    }

    // If there are any other items in the queue of the same type, remove them immediately because the added
    // utterance is meant to replace it
    this.removeUtterance( utterance, {
      assertExists: false
    } );

    // Reset the time watching utterance stability since it has been added to the queue.
    utterance.stableTime = 0;

    return utterance;
  }

  /**
   * Remove an Utterance from the queue. This function is only able to remove `Utterance` instances, and cannot remove
   * other AlertableDef types.
   * @public
   * @param {Utterance} utterance
   * @param {Object} [options]
   */
  removeUtterance( utterance, options ) {
    assert && assert( utterance instanceof Utterance );

    options = merge( {

      // If true, then an assert will make sure that the utterance is expected to be in the queue.
      assertExists: true
    }, options );

    assert && options.assertExists && assert( this.queue.indexOf( utterance ) >= 0,
      'utterance to be removed not found in queue' );

    // remove all occurrences, if applicable
    _.remove( this.queue, currentUtterance => currentUtterance === utterance );
  }

  /**
   * Returns true if the utternceQueue is running and moving through Utterances.
   * @public
   *
   * @returns {boolean}
   */
  get initializedAndEnabled() {
    return this._enabled && this._initialized;
  }

  /**
   * Returns true if the utteranceQueue is not muted and the Utterance passes its predicate function.
   * @private
   *
   * @param {Utterance} utterance
   * @returns {boolean}
   */
  canAlertUtterance( utterance ) {
    return !this._muted && utterance.predicate();
  }

  /**
   * Get the next utterance to alert if one is ready and "stable". If there are no utterances or no utterance is
   * ready to be spoken, will return null.
   * @private
   *
   * @returns {null|Utterance}
   */
  getNextUtterance() {

    // find the next item to announce - generally the next item in the queue, unless it has a delay specified that
    // is greater than the amount of time that the utterance has been sitting in the queue
    let nextUtterance = null;
    for ( let i = 0; i < this.queue.length; i++ ) {
      const utterance = this.queue[ i ];

      // if we have waited long enough for the utterance to become "stable" or the utterance has been in the queue
      // for longer than the maximum delay override, it will be spoken
      if ( utterance.stableTime > utterance.alertStableDelay || utterance.timeInQueue > utterance.alertMaximumDelay ) {
        nextUtterance = utterance;
        this.queue.splice( i, 1 );

        break;
      }
    }

    return nextUtterance;
  }

  /**
   * Returns true if the utterances is in this queue.
   * @public
   *
   * @param   {Utterance} utterance
   * @returns {boolean}
   */
  hasUtterance( utterance ) {
    return _.includes( this.queue, utterance );
  }

  /**
   * Clear the utteranceQueue of all Utterances, any Utterances remaining in the queue will
   * not be announced by the screen reader.
   *
   * @public
   */
  clear() {
    this.queue = [];
  }

  /**
   * Set whether or not the utterance queue is muted.  When muted, Utterances will still
   * move through the queue, but nothing will be sent to assistive technology.
   * @public
   *
   * @param {boolean} isMuted
   */
  setMuted( isMuted ) {
    this._muted = isMuted;
  }

  set muted( isMuted ) { this.setMuted( isMuted ); }

  /**
   * Get whether or not the utteranceQueue is muted.  When muted, Utterances will still
   * move through the queue, but nothing will be read by asistive technology.
   * @public
   */
  getMuted() {
    return this._muted;
  }

  get muted() { return this.getMuted(); }

  /**
   * Set whether or not the utterance queue is enabled.  When enabled, Utterances cannot be added to
   * the queue, and the Queue cannot be cleared. Also nothing will be sent to assistive technology.
   * @public
   *
   * @param {boolean} isEnabled
   */
  setEnabled( isEnabled ) {
    this._enabled = isEnabled;
  }

  set enabled( isEnabled ) { this.setEnabled( isEnabled ); }

  /**
   * Get whether or not the utterance queue is enabled.  When enabled, Utterances cannot be added to
   * the queue, and the Queue cannot be cleared. Also nothing will be sent to assistive technology.
   * @public
   */
  isEnabled() {
    return this._enabled;
  }

  get enabled() { return this.isEnabled(); }

  /**
   * Step the queue, called by the timer.
   *
   * @param {number} dt - time since last step, in seconds
   * @private
   */
  stepQueue( dt ) {

    // No-op function if the utteranceQueue is disabled
    if ( !this._enabled ) {
      return;
    }

    dt *= 1000; // convert to ms

    for ( let i = 0; i < this.queue.length; i++ ) {
      this.queue[ i ].timeInQueue += dt;
      this.queue[ i ].stableTime += dt;
    }

    const nextUtterance = this.getNextUtterance();

    // only speak the utterance if the Utterance predicate returns true
    if ( nextUtterance && this.canAlertUtterance( nextUtterance ) ) {

      // phet-io event to the data stream
      // TODO: What to do about this? See https://github.com/phetsims/utterance-queue/issues/17
      // We cannot get the text yet, that needs to be done in announce
      // this.phetioStartEvent( 'announced', { data: { utterance: text } } );

      this.announcer.announce( nextUtterance, nextUtterance.announcerOptions );

      // after speaking the utterance, reset time in queue for the next time it gets added back in
      nextUtterance.timeInQueue = 0;

      //this.phetioEndEvent();
    }
  }

  /**
   * Releases references
   * @public
   */
  dispose() {
    stepTimer.removeListener( this.stepQueueListener );

    super.dispose();
  }

  /**
   * Simple factory to wire up all steps for using UtteranceQueue. This accomplishes the three items needed for
   * UtteranceQueue to run:
   * 1. Step phet.axon.timer on animation frame (passing it elapsed time in seconds)
   * 2. Add UtteranceQueue's aria-live elements to the document
   * 3. Create the UtteranceQueue instance
   *
   * @example
   *
   * @public
   * @returns {UtteranceQueue}
   */
  static fromFactory() {
    const ariaHerald = new AriaHerald();
    const utteranceQueue = new UtteranceQueue( ariaHerald );

    const container = ariaHerald.ariaLiveContainer;

    // gracefully support if there is no body
    document.body ? document.body.appendChild( container ) : document.children[ 0 ].appendChild( container );

    const step = ms => {

      // time takes seconds
      phet.axon.timer.emit( ms / 1000 );
      window.requestAnimationFrame( step );
    };
    window.requestAnimationFrame( step );
    return utteranceQueue;
  }
}

UtteranceQueue.UtteranceQueueIO = new IOType( 'UtteranceQueueIO', {
  valueType: UtteranceQueue,
  documentation: 'Manages a queue of Utterances that are read in order by a screen reader.',
  events: [ 'announced' ],
  methods: {
    addToBack: {
      returnType: VoidIO,
      parameterTypes: [ StringIO ],
      implementation: function( textContent ) {
        return this.addToBack( textContent );
      },
      documentation: 'Add the utterance (string) to the end of the queue.',
      invocableForReadOnlyElements: false
    },

    addToFront: {
      returnType: VoidIO,
      parameterTypes: [ StringIO ],
      implementation: function( textContent ) {
        return this.addToFront( textContent );
      },
      documentation: 'Add the utterance (string) to the beginning of the queue.',
      invocableForReadOnlyElements: false
    },

    setMuted: {
      returnType: VoidIO,
      parameterTypes: [ BooleanIO ],
      implementation: function( muted ) {
        this.muted( muted );
      },
      documentation: 'Set whether the utteranceQueue will be muted or not. If muted, utterances still move through the ' +
                     'queue but will not be read by screen readers.',
      invocableForReadOnlyElements: false
    },
    getMuted: {
      returnType: BooleanIO,
      parameterTypes: [ VoidIO ],
      implementation: function() {
        return this.muted();
      },
      documentation: 'Get whether the utteranceQueue is muted. If muted, utterances still move through the ' +
                     'queue but will not be read by screen readers.'
    },
    setEnabled: {
      returnType: VoidIO,
      parameterTypes: [ BooleanIO ],
      implementation: function( enabled ) {
        this.enabled( enabled );
      },
      documentation: 'Set whether the utteranceQueue will be enabled or not. When enabled, Utterances cannot be added to ' +
                     'the queue, and the Queue cannot be cleared. Also nothing will be sent to assistive technology.',
      invocableForReadOnlyElements: false
    },
    isEnabled: {
      returnType: BooleanIO,
      parameterTypes: [ VoidIO ],
      implementation: function() {
        return this.enabled();
      },
      documentation: 'Get whether the utteranceQueue is enabled. When enabled, Utterances cannot be added to ' +
                     'the queue, and the Queue cannot be cleared. Also nothing will be sent to assistive technology.'
    }
  }
} );

utteranceQueueNamespace.register( 'UtteranceQueue', UtteranceQueue );
export default UtteranceQueue;