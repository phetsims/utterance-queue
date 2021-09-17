// Copyright 2019-2021, University of Colorado Boulder

/**
 * Manages a queue of Utterances that are read in order by assistive technology (AT). This queue typically reads
 * things in a first-in-first-out manner, but it is possible to send an alert directly to the front of
 * the queue. Items in the queue are sent to AT front to back, driven by AXON/timer.
 *
 * An Utterance instance is used as a unique value to the UtteranceQueue. If you add an Utterance a second time to the,
 * queue, the queue will remove the previous instance, and treat the new addition as if the Utterance has been in the
 * queue the entire time, but in the new position.
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
import Announcer from './Announcer.js';
import AriaHerald from './AriaHerald.js';
import Utterance from './Utterance.js';
import utteranceQueueNamespace from './utteranceQueueNamespace.js';

class UtteranceQueue extends PhetioObject {

  /**
   * @param {Announcer} announcer - The output implementation for the utteranceQueue, must implement an announce function
   *                             which requests speech in some way (such as the Web Speech API or aria-live)
   * @param {Object} [options]
   */
  constructor( announcer, options ) {
    assert && assert( announcer instanceof Announcer, 'announcer must be an Announcer' );

    options = merge( {

      // {boolean} - if true, all functions will be no ops. Used to support runtimes that don't use aria-live as well as
      // those that do. When true this type will not be instrumented for PhET-iO either.
      implementAsSkeleton: false,

      // phet-io
      tandem: Tandem.OPTIONAL,
      phetioType: UtteranceQueue.UtteranceQueueIO,
      phetioState: false
    }, options );

    // If just a skeleton, then we don't instrument this
    if ( options.implementAsSkeleton ) {
      options.tandem = Tandem.OPT_OUT;
    }

    super( options );

    // @public {Announcer} - sends browser requests to alert/speak either through aria-live with a screen reader or
    // SpeechSynthesis with Web Speech API (respectively), or any method that implements this interface. Use with caution,
    // and only with the understanding that you know what announcer this UtteranceQueue instance uses.
    this.announcer = announcer;

    // @private {boolean} initialization is like utteranceQueue's constructor. No-ops all around if not
    // initialized (cheers). See initialize();
    this._initialized = !options.implementAsSkeleton;

    // @public (tests) {Array.<UtteranceWrapper>} - array of UtteranceWrappers, see private class for details. Spoken
    // first in first out (fifo). Earlier utterances will be lower in the Array.
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
   * @public
   * @returns {number}
   */
  get length() {
    return this.queue.length;
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

    const utteranceWrapper = this.prepareUtterance( utterance );
    this.queue.push( utteranceWrapper );
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

    const utteranceWrapper = this.prepareUtterance( utterance );
    this.queue.unshift( utteranceWrapper );
  }

  /**
   * Create an Utterance for the queue in case of string and clears the queue of duplicate utterances. This will also
   * remove duplicates in the queue, and update to the most recent timeInQueue variable.
   * @private
   *
   * @param {AlertableDef} utterance
   * @returns {UtteranceWrapper}
   */
  prepareUtterance( utterance ) {
    if ( !( utterance instanceof Utterance ) ) {
      utterance = new Utterance( { alert: utterance } );
    }

    const utteranceWrapper = new UtteranceWrapper( utterance );

    // If there are any other items in the queue of the same type, remove them immediately because the added
    // utterance is meant to replace it
    this.removeOthersAndUpdateUtteranceWrapper( utteranceWrapper );

    // Reset the time watching utterance stability since it has been added to the queue.
    utteranceWrapper.stableTime = 0;

    return utteranceWrapper;
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
    _.remove( this.queue, utteranceWrapper => utteranceWrapper.utterance === utterance );
  }

  /**
   *
   * @private
   * @param {UtteranceWrapper} utteranceWrapper
   * @param {Object} [options]
   */
  removeOthersAndUpdateUtteranceWrapper( utteranceWrapper, options ) {
    assert && assert( utteranceWrapper instanceof UtteranceWrapper );

    const times = [];

    // we need all the times, in case there are more than one wrapper instance already in the Queue.
    for ( let i = 0; i < this.queue.length; i++ ) {
      const currentUtteranceWrapper = this.queue[ i ];
      if ( currentUtteranceWrapper.utterance === utteranceWrapper.utterance ) {
        times.push( utteranceWrapper.timeInQueue );
      }
    }

    utteranceWrapper.timeInQueue = Math.max( times );

    // remove all occurrences, if applicable. This side effect is to make sure that the timeInQueue is transferred between adding the same Utterance.
    _.remove( this.queue, currentUtteranceWrapper => currentUtteranceWrapper.utterance === utteranceWrapper.utterance );
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
      const utteranceWrapper = this.queue[ i ];

      // if we have waited long enough for the utterance to become "stable" or the utterance has been in the queue
      // for longer than the maximum delay override, it will be spoken
      if ( utteranceWrapper.stableTime > utteranceWrapper.utterance.alertStableDelay ||
           utteranceWrapper.timeInQueue > utteranceWrapper.utterance.alertMaximumDelay ) {
        nextUtterance = utteranceWrapper.utterance;
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
    for ( let i = 0; i < this.queue.length; i++ ) {
      const utteranceWrapper = this.queue[ i ];
      if ( utterance === utteranceWrapper.utterance ) {
        return true;
      }

    }
    return false;
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
    if ( !this._enabled || this.queue.length === 0 ) {
      return;
    }

    dt *= 1000; // convert to ms

    for ( let i = 0; i < this.queue.length; i++ ) {
      const utteranceWrapper = this.queue[ i ];
      utteranceWrapper.timeInQueue += dt;
      utteranceWrapper.stableTime += dt;
    }

    const nextUtterance = this.getNextUtterance();

    if ( nextUtterance ) {
      this.attemptToAnnounce( nextUtterance );
    }
  }

  /**
   * Bypass the queue, and immediately trigger an announce() call on the announcer with this utterance. It is possible
   * that this same utterance is currently in the queue in another reference. This method complete bypasses all timing
   * variables, and will not effect the timing on the other references to this Utterance currently in the queue. For
   * example this will not reset the timeInQueue noting that the utterance was just alerted.
   * @public
   * @param {AlertableDef} utterance
   */
  announceImmediately( utterance ) {
    assert && assert( AlertableDef.isAlertableDef( utterance ), `trying to alert something that isn't alertable: ${utterance}` );

    // No-op if the utteranceQueue is disabled
    if ( !this.initializedAndEnabled ) {
      return;
    }

    // Don't call prepareUtterance because we want to bypass queue operations.
    if ( !( utterance instanceof Utterance ) ) {
      utterance = new Utterance( { alert: utterance } );
    }

    this.attemptToAnnounce( utterance );
  }

  /**
   * @private
   * @param {Utterance} utterance
   */
  attemptToAnnounce( utterance ) {

    // only speak the utterance if not muted and the Utterance predicate returns true
    if ( !this._muted && utterance.predicate() && utterance.getAlertText( this.respectResponseCollectorProperties ) !== '' ) {
      this.announcer.announce( utterance, utterance.announcerOptions );
    }
  }

  /**
   * Releases references
   * @public
   */
  dispose() {

    // only remove listeners if they were added in initialize
    if ( this._initialized ) {
      stepTimer.removeListener( this.stepQueueListener );
    }

    super.dispose();
  }

  /**
   * Simple factory to wire up all steps for using UtteranceQueue for aria-live alerts. This accomplishes the three items
   * needed for UtteranceQueue to run:
   * 1. Step phet.axon.stepTimer on animation frame (passing it elapsed time in seconds)
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

    let previousTime = 0;
    const step = elapsedTime => {
      const dt = elapsedTime - previousTime;
      previousTime = elapsedTime;

      // time takes seconds
      phet.axon.stepTimer.emit( dt / 1000 );
      window.requestAnimationFrame( step );
    };
    window.requestAnimationFrame( step );
    return utteranceQueue;
  }
}

// One instance per entry in the Queue
class UtteranceWrapper {
  constructor( utterance ) {

    // @public
    this.utterance = utterance;

    // @public {number} - In ms, how long this utterance has been in the queue. The
    // same Utterance can be in the queue more than once (for utterance looping or while the utterance stabilizes),
    // in this case the time will be since the first time the utterance was added to the queue.
    this.timeInQueue = 0;

    // @public {number}  - in ms, how long this utterance has been "stable", which
    // is the amount of time since this utterance has been added to the utteranceQueue.
    this.stableTime = 0;
  }

  /**
   * Reset variables that track instance variables related to time.
   * @public
   */
  resetTimingVariables() {
    this.timeInQueue = 0;
    this.stableTime = 0;
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