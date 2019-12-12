// Copyright 2019, University of Colorado Boulder

/**
 * Manages a queue of Utterances that are read in order by a screen reader.  This queue typically reads
 * things in a first-in-first-out manner, but it is possible to send an alert directly to the front of
 * the queue.  Items in the queue are sent to the screen reader front to back, driven by AXON/timer.
 *
 * Screen readers are inconsistent in the way that they order alerts, some use last-in-first-out order,
 * others use first-in-first-out order, others just read the last alert that was provided. This queue
 * manages order and improves consistency.
 *
 * NOTE: UtteranceQueue is a type but instantiated and returned as a singleton.  It is initialized by Sim.js and if
 * something adds an alert to the queue before Sim.js has initialized the queue, the result will be a silent no-op.
 *
 * @author Jesse Greenberg (PhET Interactive Simulations)
 * @author Michael Kauzmann (PhET Interactive Simulations)
 */
define( require => {
  'use strict';

  // modules
  const AlertableDef = require( 'UTTERANCE_QUEUE/AlertableDef' );
  const AriaHerald = require( 'UTTERANCE_QUEUE/AriaHerald' );
  const PhetioObject = require( 'TANDEM/PhetioObject' );
  const utteranceQueueNamespace = require( 'UTTERANCE_QUEUE/utteranceQueueNamespace' );
  const Tandem = require( 'TANDEM/Tandem' );
  const timer = require( 'AXON/timer' );
  const Utterance = require( 'UTTERANCE_QUEUE/Utterance' );
  const UtteranceQueueIO = require( 'UTTERANCE_QUEUE/UtteranceQueueIO' );

  class UtteranceQueue extends PhetioObject {

    /**
     * @param {boolean} implementAsSkeleton=false - if true, all functions will be no ops. Used to support runtimes
     *                                               that don't use aria-live as well as those that do.
     */
    constructor( implementAsSkeleton = false ) {

      let superTypeOptions = null;

      if ( !implementAsSkeleton ) {
        superTypeOptions = {
          tandem: Tandem.GENERAL.createTandem( 'utteranceQueue' ),
          phetioType: UtteranceQueueIO,
          phetioState: false
        };
      }

      super( superTypeOptions );

      // @private {boolean} initialization is like utteranceQueue's constructor. No-ops all around if not
      // initialized (cheers). See initialize();
      this._initialized = !implementAsSkeleton;

      // @public (tests) {Array.<Utterance>} - array of Utterances, spoken in first to last order
      this.queue = [];

      // whether or not Utterances moving through the queue are read by a screen reader
      this._muted = false;

      // whether the UtterancesQueue is alerting, and if you can add/remove utterances
      this._enabled = true;

      // @public (read-only) - the interface with the dom elements
      this.ariaHerald = new AriaHerald();

      if ( this._initialized ) {

        // begin stepping the queue
        timer.addListener( this.stepQueue.bind( this ) );
      }
    }

    /**
     * Get the HTMLElement that houses all aria-live elements needed for the utterance queue to alert.
     * @public
     * @returns {HTMLDivElement}
     */
    getAriaLiveContainer() {
      return this.ariaHerald.ariaLiveContainer;
    }

    /**
     * Add an utterance ot the end of the queue.  If the utterance has a type of alert which
     * is already in the queue, the older alert will be immediately removed.
     *
     * @public
     * @param {AlertableDef} utterance
     */
    addToBack( utterance ) {
      assert && assert( AlertableDef.isAlertableDef( utterance ), 'trying to alert something that isn\'t alertable: ' + utterance );

      // No-op if the utteranceQueue is disabled
      if ( !this.initializedAndEnabled ) {
        return;
      }

      utterance = this.prepareUtterance( utterance );
      this.queue.push( utterance );
    }

    /**
     * Convenience function to help with nullable values. No-op if null or nothing is passed in
     * @param {null|AlertableDef} [utterance]
     */
    addToBackIfDefined( utterance ) {
      if ( utterance !== null && utterance !== undefined ) {
        assert && assert( AlertableDef.isAlertableDef( utterance ), 'trying to alert something that isn\'t alertable: ' + utterance );

        this.addToBack( utterance );
      }
    }

    /**
     * Add an utterance to the front of the queue to be read immediately.
     * @param {AlertableDef} utterance
     */
    addToFront( utterance ) {
      assert && assert( AlertableDef.isAlertableDef( utterance ), 'trying to alert something that isn\'t alertable: ' + utterance );

      // No-op function if the utteranceQueue is disabled
      if ( !this.initializedAndEnabled ) {
        return;
      }

      utterance = this.prepareUtterance( utterance );
      this.queue.unshift( utterance );
    }

    /**
     * Create an Utterance for the queue in case of string and clears the queue of duplicate utterances.
     *
     * @param {AlertableDef} utterance
     * @returns {Utterance}
     */
    prepareUtterance( utterance ) {
      if ( typeof utterance === 'string' ) {
        utterance = new Utterance( { alert: utterance } );
      }

      // if there are any other items in the queue of the same type, remove them immediately because the added
      // utterance is meant to replace it
      _.remove( this.queue, currentUtterance => currentUtterance === utterance );

      // reset the time watching utterance stability since it has been added to the queue
      utterance.stableTime = 0;

      return utterance;
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
    getEnabled() {
      return this._enabled;
    }

    get enabled() { return this.getEnabled(); }

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

        // just get the text of the Utterance once! This is because getting it triggers updates in the Utterance that
        // should only be triggered on alert! See Utterance.getTextToAlert
        const text = nextUtterance.getTextToAlert();

        // phet-io event to the data stream
        this.phetioStartEvent( 'announced', { utterance: text } );

        // Pass the utterance text on to be set in the PDOM.
        this.ariaHerald.announcePolite( text );

        // after speaking the utterance, reset time in queue for the next time it gets added back in
        nextUtterance.timeInQueue = 0;

        this.phetioEndEvent();
      }
    }
  }

  return utteranceQueueNamespace.register( 'UtteranceQueue', UtteranceQueue );
} );