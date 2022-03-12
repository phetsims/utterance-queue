// Copyright 2019-2022, University of Colorado Boulder

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
import deprecationWarning from '../../phet-core/js/deprecationWarning.js';
import optionize from '../../phet-core/js/optionize.js';
import PhetioObject, { PhetioObjectOptions } from '../../tandem/js/PhetioObject.js';
import Announcer from './Announcer.js';
import AriaLiveAnnouncer from './AriaLiveAnnouncer.js';
import Utterance, { IAlertable } from './Utterance.js';
import utteranceQueueNamespace from './utteranceQueueNamespace.js';
import UtteranceWrapper from './UtteranceWrapper.js';

type SelfOptions = {

  // add extra logging, helpful during debugging
  debug?: boolean

  // By default, initialize the UtteranceQueue fully, with all features, if false, each function of this type will no-op
  initialize?: boolean
};
type UtteranceQueueOptions = SelfOptions & PhetioObjectOptions;


class UtteranceQueue extends PhetioObject {

  // Sends browser requests to announce either through aria-live with a screen reader or
  // SpeechSynthesis with Web Speech API (respectively), or any method that implements this interface. Use with caution,
  // and only with the understanding that you know what Announcer this UtteranceQueue instance uses.
  announcer: Announcer;

  // Initialization is like utteranceQueue's constructor. No-ops all around if not
  // initialized (cheers). See constructor()
  private _initialized: boolean;

  // (tests) - array of UtteranceWrappers, see private class for details. Announced
  // first in first out (fifo). Earlier utterances will be lower in the Array.
  queue: UtteranceWrapper[];

  // whether Utterances moving through the queue are read by a screen reader
  private _muted: boolean;

  // whether the UtterancesQueue is alerting, and if you can add/remove utterances
  private _enabled: boolean;

  // Maps the Utterance to a listener on its priorityProperty that will
  // update the queue when priority changes. The map lets us remove the listener when the Utterance gets
  // removed from the queue. Only Utterances that are in the queue should be added to this. For handling
  // priority-listening while an Utterance is being announced, see this.announcingUtteranceWrapper.
  private utteranceToPriorityListenerMap: Map<Utterance, () => void>;

  // A reference to an UtteranceWrapper that contains the Utterance that is provided to
  // the Announcer when we actually call announcer.announce(). While the Announcer is announcing this Utterance,
  // a listener needs to remain on the Utterance.priorityProperty so that we can reprioritize Utterances or
  // interrupt this Utterance if priorityProperty changes. A separate reference to this UtteranceWrapper supports
  // having a listener on an Utterance in the queue with utteranceToPriorityListenerMap while the announcer is
  // announcing that Utterance at the same time. See https://github.com/phetsims/utterance-queue/issues/46.
  private announcingUtteranceWrapper: UtteranceWrapper | null;

  private debug: boolean;

  stepQueueListener: null | ( ( dt: number ) => void ); // only null when UtteranceQueue is not initialized

  /**
   * @param announcer - The output implementation for the utteranceQueue, must implement an announce function
   *                             which requests speech in some way (such as the Web Speech API or aria-live)
   * @param providedOptions
   */
  constructor( announcer: Announcer, providedOptions?: UtteranceQueueOptions ) {
    assert && assert( announcer instanceof Announcer, 'announcer must be an Announcer' );

    const options = optionize<UtteranceQueueOptions, SelfOptions, PhetioObject>( {
      debug: false,
      initialize: true
    }, providedOptions );

    super( options );

    this.announcer = announcer;

    this._initialized = options.initialize;

    this.queue = [];

    this._muted = false;

    this._enabled = true;

    this.utteranceToPriorityListenerMap = new Map();

    this.announcingUtteranceWrapper = null;

    this.debug = options.debug;

    // When the Announcer is done with an Utterance, remove priority listeners and remove from the
    // utteranceToPriorityListenerMap.
    this.announcer.announcementCompleteEmitter.addListener( ( utterance: Utterance ) => {

      // Multiple UtteranceQueues may use the same Announcer, so we need to make sure that we are responding
      // to an announcement completion for the right Utterance.
      if ( this.announcingUtteranceWrapper && utterance === this.announcingUtteranceWrapper.utterance ) {
        assert && assert( this.announcingUtteranceWrapper.announcingUtterancePriorityListener, 'announcingUtterancePriorityListener should be set on this.announcingUtteranceWrapper' );
        const announcingUtterancePriorityListener = this.announcingUtteranceWrapper.announcingUtterancePriorityListener!;

        // It is possible that this.announcer is also used by a different UtteranceQueue so when
        // announcementCompleteEmitter emits, it may not be for this UtteranceWrapper. this.announcingUtteranceWrapper
        // and its announcingUtterancePriorityListener could only have been set by this queue, so this check ensures
        // that we are removing the priorityProperty listener from the correct Utterance.
        if ( this.announcingUtteranceWrapper.utterance.priorityProperty.hasListener( announcingUtterancePriorityListener ) ) {
          this.announcingUtteranceWrapper.utterance.priorityProperty.unlink( announcingUtterancePriorityListener );

          this.announcingUtteranceWrapper.announcingUtterancePriorityListener = null;
          this.announcingUtteranceWrapper = null;
        }
      }
    } );

    this.stepQueueListener = null;

    if ( this._initialized ) {

      // @private {function}
      this.stepQueueListener = this.stepQueue.bind( this );

      // begin stepping the queue
      stepTimer.addListener( this.stepQueueListener );
    }
  }

  get length(): number {
    return this.queue.length;
  }

  /**
   * Add an utterance ot the end of the queue.  If the utterance has a type of alert which
   * is already in the queue, the older alert will be immediately removed.
   */
  addToBack( utterance: IAlertable ): void {

    // No-op if the utteranceQueue is disabled
    if ( !this.initializedAndEnabled ) {
      return;
    }

    if ( this.announcer.announceImmediatelyUntilSpeaking && !this.announcer.hasSpoken ) {

      // We haven't successfully spoken with the technology of the Announcer yet, keep trying
      // to speak synchronously to be compatible with browser limitations that the first usage
      // of speech needs to come from a synchronous request form the user.
      this.announceImmediately( utterance );
    }
    else {

      // Remove identical Utterances from the queue and wrap with a class that will manage timing variables.
      const utteranceWrapper = this.prepareUtterance( utterance );

      // Add to the queue before prioritizing so that we know which Utterances to prioritize against
      this.queue.push( utteranceWrapper );

      this.debug && console.log( 'addToBack: ', utteranceWrapper.utterance.getAlertText( this.announcer.respectResponseCollectorProperties ) );

      // Add listeners that will re-prioritize the queue when the priorityProperty changes
      this.addPriorityListenerAndPrioritizeQueue( utteranceWrapper );
    }
  }

  /**
   * Add an utterance to the front of the queue to be read immediately.
   * @deprecated
   */
  addToFront( utterance: IAlertable ): void {
    deprecationWarning( '`addToFront()` has been deprecated because it is confusing, and most of the time doesn\'t do what ' +
                        'is expected, because Utterances are announced based on time-in-queue first, and then position ' +
                        'in the queue. It is recommended to use addToBack, and then timing variables on Utterances, ' +
                        'or instead call queue.clear() before adding a more important alert to the queue.' );


    // No-op function if the utteranceQueue is disabled
    if ( !this.initializedAndEnabled ) {
      return;
    }

    const utteranceWrapper = this.prepareUtterance( utterance );
    this.queue.unshift( utteranceWrapper );
  }

  /**
   * Adds a listener to the priorityProperty of an Utterance, and puts the listener on a map so it
   * can easily be removed later. Finally, re-prioritizes Utterances in the queue based on the
   * priority of the new utterance.
   *
   * You must add the utteranceWrapper to the queue before calling this function.
   */
  private addPriorityListenerAndPrioritizeQueue( utteranceWrapper: UtteranceWrapper ): void {
    assert && assert( !this.utteranceToPriorityListenerMap.has( utteranceWrapper.utterance ),
      'About to add the priority listener twice and only one should exist on the Utterance. The listener should have been removed by removeOthersAndUpdateUtteranceWrapper.' );
    const priorityListener = () => {
      this.prioritizeUtterances( utteranceWrapper );
    };
    utteranceWrapper.utterance.priorityProperty.lazyLink( priorityListener );
    this.utteranceToPriorityListenerMap.set( utteranceWrapper.utterance, priorityListener );

    this.prioritizeUtterances( utteranceWrapper );
  }

  /**
   * Create an Utterance for the queue in case of string and clears the queue of duplicate utterances. This will also
   * remove duplicates in the queue, and update to the most recent timeInQueue variable.
   */
  private prepareUtterance( utterance: IAlertable ): UtteranceWrapper {
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
   * other IAlertable types.
   */
  removeUtterance( utterance: Utterance ): void {
    assert && assert( utterance instanceof Utterance );

    const utteranceWrapperToUtteranceMapper = ( utteranceWrapper: UtteranceWrapper ) => utteranceWrapper.utterance === utterance;

    assert && assert( _.find( this.queue, utteranceWrapperToUtteranceMapper ), 'utterance to be removed not found in queue' );

    // remove all occurrences, if applicable
    const removedUtteranceWrappers = _.remove( this.queue, utteranceWrapperToUtteranceMapper );
    this.removePriorityListeners( removedUtteranceWrappers );
  }

  /**
   * Remove earlier Utterances from the queue if the Utterance is important enough. This will also interrupt
   * the utterance that is in the process of being announced by the Announcer.
   */
  prioritizeUtterances( utteranceWrapperToPrioritize: UtteranceWrapper ): void {

    const utteranceWrapperIndex = this.queue.indexOf( utteranceWrapperToPrioritize );
    const utteranceWrapperInQueue = utteranceWrapperIndex >= 0;

    // utteranceWrapperToPrioritize will only affect other Utterances that are "ahead" of it in the queue
    let traverseToFrontStartIndex;
    if ( utteranceWrapperInQueue ) {

      // The utterance is in the queue already, we need to walk back to the front of the queue to remove
      // Utterances that have a lower priority.
      traverseToFrontStartIndex = utteranceWrapperIndex - 1;
    }
    else {

      // If not in the queue, priority will be managed by the announcer.
      traverseToFrontStartIndex = -1;
    }

    // Update the queue before letting the Announcer know that priority is changing, since that could stop current
    // speech and possibly start the next utterance to be announced.
    for ( let i = traverseToFrontStartIndex; i >= 0; i-- ) {
      const otherUtteranceWrapper = this.queue[ i ];
      if ( this.shouldUtteranceCancelOther( utteranceWrapperToPrioritize.utterance, otherUtteranceWrapper.utterance ) ) {
        this.removeUtterance( otherUtteranceWrapper.utterance );
      }
    }

    // Now look backwards to determine if the utteranceWrapper should be removed because an utterance behind it
    // has a higher priority. The only utterance that we have to check is the next one in the queue because
    // any utterance further back MUST be of lower priority. The next Utterance after
    // utteranceWrapperToPrioritize.utterance would have been removed when the higher priority utterances further
    // back were added.
    if ( utteranceWrapperInQueue ) {
      const otherUtteranceWrapper = this.queue[ utteranceWrapperIndex + 1 ];
      if ( otherUtteranceWrapper && this.shouldUtteranceCancelOther( otherUtteranceWrapper.utterance, utteranceWrapperToPrioritize.utterance ) ) {
        this.removeUtterance( utteranceWrapperToPrioritize.utterance );
      }
    }

    // Let the Announcer know that priority has changed so that it can do work such as cancel the currently speaking
    // utterance if it has become low priority
    if ( this.queue.length > 0 ) {
      this.announcer.onUtterancePriorityChange( this.queue[ 0 ].utterance );
    }
  }

  /**
   * Given one utterance, should it cancel the other? The priority is used to determine if
   * one Utterance should cancel another, but the Announcer may override with its own logic.
   */
  private shouldUtteranceCancelOther( utterance: Utterance, utteranceToCancel: Utterance ): boolean {
    assert && assert( utterance instanceof Utterance );
    assert && assert( utteranceToCancel instanceof Utterance );

    return this.announcer.shouldUtteranceCancelOther( utterance, utteranceToCancel );
  }

  private removeOthersAndUpdateUtteranceWrapper( utteranceWrapper: UtteranceWrapper ): void {
    assert && assert( utteranceWrapper instanceof UtteranceWrapper );

    const times = [];

    // we need all the times, in case there are more than one wrapper instance already in the Queue.
    for ( let i = 0; i < this.queue.length; i++ ) {
      const currentUtteranceWrapper = this.queue[ i ];
      if ( currentUtteranceWrapper.utterance === utteranceWrapper.utterance ) {
        times.push( currentUtteranceWrapper.timeInQueue );
      }
    }

    if ( times.length >= 1 ) {
      utteranceWrapper.timeInQueue = Math.max( ...times );
    }

    // remove all occurrences, if applicable. This side effect is to make sure that the timeInQueue is transferred between adding the same Utterance.
    const removedWrappers = _.remove( this.queue, currentUtteranceWrapper => currentUtteranceWrapper.utterance === utteranceWrapper.utterance );
    this.removePriorityListeners( removedWrappers );
  }

  /**
   * Returns true if the UtteranceQueue is running and moving through Utterances.
   */
  get initializedAndEnabled(): boolean {
    return this._enabled && this._initialized;
  }

  /**
   * Get the next utterance to alert if one is ready and "stable". If there are no utterances or no utterance is
   * ready to be announced, will return null.
   */
  private getNextUtterance(): null | UtteranceWrapper {

    // find the next item to announce - generally the next item in the queue, unless it has a delay specified that
    // is greater than the amount of time that the utterance has been sitting in the queue
    let nextUtteranceWrapper = null;
    for ( let i = 0; i < this.queue.length; i++ ) {
      const utteranceWrapper = this.queue[ i ];

      // if we have waited long enough for the utterance to become "stable" or the utterance has been in the queue
      // for longer than the maximum delay override, it will be announced
      if ( utteranceWrapper.stableTime > utteranceWrapper.utterance.alertStableDelay ||
           utteranceWrapper.timeInQueue > utteranceWrapper.utterance.alertMaximumDelay ) {
        nextUtteranceWrapper = utteranceWrapper;

        break;
      }
    }

    return nextUtteranceWrapper;
  }

  /**
   * Returns true if the utterances is in this queue.
   */
  hasUtterance( utterance: Utterance ): boolean {
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
   */
  clear(): void {

    // Removes all priority listeners from the queue.
    this.removePriorityListeners( this.queue );

    this.queue = [];
  }

  /**
   * Cancel the provided utterance if it is being spoken by the Announcer. No-op if this Utterance is not being\
   * Announced. Does nothing to Utterances that remain in the queue. The Announcer implements the behavior to stop
   * speech.
   */
  cancelUtterance( utterance: Utterance ): void {
    this.announcer.cancelUtterance( utterance );
  }

  /**
   * Clears all Utterances from the queue and cancels announcement of any Utterances that are being
   * announced by the Announcer.
   */
  cancel(): void {
    this.clear();
    this.announcer.cancel();
  }

  /**
   * Removes the listeners on Utterance Priority for all provided UtteranceWrappers.
   */
  private removePriorityListeners( utteranceWrappers: UtteranceWrapper[] ) {
    utteranceWrappers.forEach( utteranceWrapper => this.removePriorityListener( utteranceWrapper.utterance ) );
  }

  private removePriorityListener( utterance: Utterance ): void {
    const listener = this.utteranceToPriorityListenerMap.get( utterance );

    // The same Utterance may exist multiple times in the queue if we are removing duplicates from the array,
    // so the listener may have already been removed.
    if ( listener ) {
      utterance.priorityProperty.unlink( listener );
      this.utteranceToPriorityListenerMap.delete( utterance );
    }
  }

  /**
   * Set whether or not the utterance queue is muted.  When muted, Utterances will still
   * move through the queue, but nothing will be sent to assistive technology.
   */
  setMuted( isMuted: boolean ): void {
    this._muted = isMuted;
  }

  set muted( isMuted: boolean ) { this.setMuted( isMuted ); }

  /**
   * Get whether or not the utteranceQueue is muted.  When muted, Utterances will still
   * move through the queue, but nothing will be read by asistive technology.
   */
  getMuted() {
    return this._muted;
  }

  get muted() { return this.getMuted(); }

  /**
   * Set whether or not the utterance queue is enabled.  When enabled, Utterances cannot be added to
   * the queue, and the Queue cannot be cleared. Also nothing will be sent to assistive technology.
   */
  setEnabled( isEnabled: boolean ) {
    this._enabled = isEnabled;
  }

  set enabled( isEnabled ) { this.setEnabled( isEnabled ); }

  /**
   * Get whether or not the utterance queue is enabled.  When enabled, Utterances cannot be added to
   * the queue, and the Queue cannot be cleared. Also nothing will be sent to assistive technology.
   */
  isEnabled(): boolean {
    return this._enabled;
  }

  get enabled(): boolean { return this.isEnabled(); }

  /**
   * Step the queue, called by the timer.
   * @param dt - time since last step, in seconds
   */
  private stepQueue( dt: number ) {

    // No-op function if the utteranceQueue is disabled
    if ( !this._enabled ) {
      return;
    }

    dt *= 1000; // convert to ms

    if ( this.queue.length > 0 ) {
      for ( let i = 0; i < this.queue.length; i++ ) {
        const utteranceWrapper = this.queue[ i ];
        utteranceWrapper.timeInQueue += dt;
        utteranceWrapper.stableTime += dt;
      }

      const nextUtteranceWrapper = this.getNextUtterance();
      if ( nextUtteranceWrapper ) {
        this.attemptToAnnounce( nextUtteranceWrapper );
      }
    }

    // any specific updates that are managed by the announcer each step
    this.announcer.step( dt, this.queue );
  }

  /**
   * Immediately announce the provided Utterance. If the Announcer is ready to announce, the Utterance will be announced
   * synchronously with this call. Otherwise, the Utterance will be added to the front of the queue to be announced
   * as soon as the Announcer is ready.
   *
   * This function should generally not be used. Use addToBack() in correlation with priorityProperty and timing variables
   * to control the flow of Utterances. This function can be useful when you need an Utterance to be announced
   * synchronously with user input (for example, due to browser constraints on initializing SpeechSynthesis).
   *
   * Any duplicate instance of the provided Utterance that is already in the queue will be removed, matching the
   * behavior of addToBack().
   *
   * announceImmediately() respects Utterance.priorityProperty. A provided Utterance with a priority equal to or lower
   * than what is being announced will not interrupt and will never be announced. If an Utterance at the front of the
   * queue has a higher priority than the provided Utterance, the provided Utterance will never be announced. If the
   * provided Utterance has a higher priority than what is at the front of the queue or what is being announced, it will
   * be announced immediately and most likely interrupt the announcer.
   */
  announceImmediately( utterance: IAlertable ) {

    // No-op if the utteranceQueue is disabled
    if ( !this.initializedAndEnabled ) {
      return;
    }

    // Don't call prepareUtterance because we want to bypass queue operations.
    if ( !( utterance instanceof Utterance ) ) {
      utterance = new Utterance( { alert: utterance } );
    }

    // Remove identical Utterances from the queue and wrap with a class that will manage timing variables.
    const utteranceWrapper = this.prepareUtterance( utterance );

    // set timing variables such that the utterance is ready to announce immediately
    utteranceWrapper.stableTime = Number.POSITIVE_INFINITY;
    utteranceWrapper.timeInQueue = Number.POSITIVE_INFINITY;

    // addPriorityListenerAndPrioritizeQueue assumes the UtteranceWrapper is in the queue, add first
    this.queue.unshift( utteranceWrapper );
    this.addPriorityListenerAndPrioritizeQueue( utteranceWrapper );

    // Prioritization may have determined that this utterance should not be announced, and so was
    // quickly removed from the queue.
    if ( this.queue.includes( utteranceWrapper ) ) {

      // Attempt to announce the Utterance immediately (synchronously) - if the announcer is not ready
      // yet, it will still be at the front of the queue and will be next to be announced as soon as possible
      this.attemptToAnnounce( utteranceWrapper );
    }
  }

  private attemptToAnnounce( utteranceWrapper: UtteranceWrapper ): void {
    const utterance = utteranceWrapper.utterance;

    this.debug && console.log( 'attemptToAnnounce: ', utterance.getAlertText( this.announcer.respectResponseCollectorProperties ) );

    // only query and remove the next utterance if the announcer indicates it is ready for speech
    if ( this.announcer.readyToAnnounce ) {

      // only announce the utterance if not muted and the Utterance predicate returns true
      if ( !this._muted && utterance.predicate() && utterance.getAlertText( this.announcer.respectResponseCollectorProperties ) !== '' ) {
        assert && assert( this.announcingUtteranceWrapper === null, 'announcingUtteranceWrapper and its priorityProperty listener should have been disposed' );

        // Save a reference to the UtteranceWrapper and its priorityProperty listener while the Announcer is announcing
        // it so that it can be removed at the end of announcement.
        this.announcingUtteranceWrapper = utteranceWrapper;
        this.announcingUtteranceWrapper.announcingUtterancePriorityListener = () => {
          this.prioritizeUtterances( utteranceWrapper );
        };
        utteranceWrapper.utterance.priorityProperty.link( this.announcingUtteranceWrapper.announcingUtterancePriorityListener );

        this.debug && console.log( 'announcing: ', utterance.getAlertText( this.announcer.respectResponseCollectorProperties ) );
        this.announcer.announce( utterance, utterance.announcerOptions );
      }

      // Announcer.announce may remove this Utterance as a side effect in a listener eagerly (for example
      // if we try to clear the queue when this Utterance ends, but it ends immediately because the browser
      // is not ready for speech). See https://github.com/phetsims/utterance-queue/issues/45.
      // But generally, the Utterance should still be in the queue and should now be removed.
      this.queue.includes( utteranceWrapper ) && this.removeUtterance( utteranceWrapper.utterance );
    }
  }

  override dispose(): void {

    // only remove listeners if they were added in initialize
    if ( this._initialized ) {
      assert && assert( this.stepQueueListener );
      stepTimer.removeListener( this.stepQueueListener! );
    }

    super.dispose();
  }

  /**
   * Simple factory to wire up all steps for using UtteranceQueue for aria-live alerts. This accomplishes the three items
   * needed for UtteranceQueue to run:
   * 1. Step phet.axon.stepTimer on animation frame (passing it elapsed time in seconds)
   * 2. Add UtteranceQueue's aria-live elements to the document
   * 3. Create the UtteranceQueue instance
   */
  static fromFactory(): UtteranceQueue {
    const ariaLiveAnnouncer = new AriaLiveAnnouncer();
    const utteranceQueue = new UtteranceQueue( ariaLiveAnnouncer );

    const container = ariaLiveAnnouncer.ariaLiveContainer;

    // gracefully support if there is no body
    document.body ? document.body.appendChild( container ) : document.children[ 0 ].appendChild( container );

    let previousTime = 0;
    const step = ( elapsedTime: number ) => {
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

utteranceQueueNamespace.register( 'UtteranceQueue', UtteranceQueue );
export default UtteranceQueue;