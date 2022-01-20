// Copyright 2022, University of Colorado Boulder

/**
 * QUnit tests for Utterance and UtteranceQueue that use voicingManager as the Announcer.
 *
 * @author Michael Kauzmann (PhET Interactive Simulations)
 * @author Jesse Greenberg (PhET Interactive Simulations)
 */

import stepTimer from '../../axon/js/stepTimer.js';
import { voicingManager } from '../../scenery/js/imports.js';
import responseCollector from './responseCollector.js';
import Utterance from './Utterance.js';
import UtteranceQueue from './UtteranceQueue.js';

const queryParameters = QueryStringMachine.getAll( {
  manualInput: {
    type: 'flag'
  }
} );

// See VOICING_UTTERANCE_INTERVAL in voicingManager for why this is necessary. We need to wait this long before
// checking on the utteranceQueue state when working with voicing.
const VOICING_UTTERANCE_INTERVAL = 250;

// When we want to add a little time to make that an interval has completed.
const TIMING_BUFFER = VOICING_UTTERANCE_INTERVAL + 50;

const testVoicingManager = new voicingManager.constructor();
const testVoicingUtteranceQueue = new UtteranceQueue( testVoicingManager );

testVoicingManager.initialize();
testVoicingManager.enabledProperty.value = true;

// helper es6 functions from  https://stackoverflow.com/questions/33289726/combination-of-async-function-await-settimeout/33292942
function timeout( ms ) {
  return new Promise( resolve => setTimeout( resolve, ms ) ); // eslint-disable-line bad-sim-text
}

let alerts = [];

// Utterance options that will have no cancellation from cancelSelf and cancelOther
const noCancelOptions = {
  cancelSelf: false,
  cancelOther: false
};

const timeUtterance = utterance => {
  return new Promise( resolve => {
    const startTime = Date.now();
    testVoicingUtteranceQueue.addToBack( utterance );

    testVoicingManager.announcementCompleteEmitter.addListener( function toRemove( completeUtterance ) {
      if ( completeUtterance === utterance ) {
        resolve( Date.now() - startTime );
        testVoicingManager.announcementCompleteEmitter.removeListener( toRemove );
      }
    } );
  } );
};

const firstUtterance = new Utterance( {
  alert: 'This is the first utterance',
  alertStableDelay: 0,
  announcerOptions: noCancelOptions
} );
const secondUtterance = new Utterance( {
  alert: 'This is the second utterance',
  alertStableDelay: 0,
  announcerOptions: noCancelOptions
} );

const thirdUtterance = new Utterance( {
  alert: 'This is the third utterance',
  alertStableDelay: 0,
  announcerOptions: noCancelOptions
} );

/**
 * Reset the testVoicingManager and the testVoicingUtteranceQueue and wait for the testVoicingManager to be
 * ready to speak again after its delay. Used between tests.
 */
async function resetQueueAndAnnouncer() {
  testVoicingManager.cancel();
  testVoicingUtteranceQueue.clear();

  // all have default priority for the next test
  firstUtterance.priorityProperty.value = 1;
  secondUtterance.priorityProperty.value = 1;
  thirdUtterance.priorityProperty.value = 1;

  // From debugging, I am not convinced that setInterval is called consistently while we wait for timeouts. Stepping
  // the timer here improves consistency and gets certain tests passing. Specifically, I want to make sure that
  // timing variables related to waiting for voicingManager to be readyToAnnounce have enough time to reset
  stepTimer.emit( TIMING_BUFFER );
  await timeout( TIMING_BUFFER );
}

let timeForFirstUtterance;
let timeForSecondUtterance;
let timeForThirdUtterance;

let intervalID = null;
QUnit.module( 'UtteranceQueue', {
  before: async () => {

    // timer step in seconds, stepped 60 times per second
    const timerInterval = 1 / 60;

    // step the timer, because utteranceQueue runs on timer
    intervalID = setInterval( () => { // eslint-disable-line bad-sim-text
      stepTimer.emit( timerInterval ); // step timer in seconds
    }, timerInterval * 1000 );

    // whenever announcing, get a callback and populate the alerts array
    testVoicingManager.announcementCompleteEmitter.addListener( utterance => {
      alerts.unshift( utterance );
    } );

    if ( queryParameters.manualInput ) {

      // This seems long, but gives us time to click into the browser before the first test. The following
      // timeUtterance calls can run almost instantly and if you don't click into the sim before they start
      // the tests can break. We try to verify that you clicked into the browser with the following error, but
      // it won't catch everyting. If you click into the browser halfway through speaking the first utterance,
      // the time for the first utterance may be greater than 2000 ms but the timings will still be off.
      await timeout( 3000 );

      timeForFirstUtterance = await timeUtterance( firstUtterance );
      timeForSecondUtterance = await timeUtterance( secondUtterance );
      timeForThirdUtterance = await timeUtterance( thirdUtterance );

      if ( timeForFirstUtterance < 2000 || timeForSecondUtterance < 2000 || timeForThirdUtterance < 2000 ) {
        console.log( `timeForFirstUtterance: ${timeForFirstUtterance}, timeForThirdUtterance: ${timeForSecondUtterance}, timeForThirdUtterane: ${timeForThirdUtterance}` );
        throw new Error( 'time for Utterances is too short, did you click in the window before the first test started?' );
      }
    }

    alerts = [];
  },
  beforeEach: async () => {

    // clear the alerts before each new test
    alerts = [];
    await resetQueueAndAnnouncer();
    responseCollector.reset();
  },
  after() {
    clearInterval( intervalID );
  }
} );

QUnit.test( 'Welcome to UtteranceQueueTests!', async assert => {
  assert.ok( true, 'UtteranceQueue tests take time, run with ?manualInput and click in the window before the first test' );
} );

if ( queryParameters.manualInput ) {

  QUnit.test( 'Basic UtteranceQueue test', async assert => {

    // basic test, we should hear all three Utterances
    testVoicingUtteranceQueue.addToBack( firstUtterance );
    testVoicingUtteranceQueue.addToBack( secondUtterance );
    testVoicingUtteranceQueue.addToBack( thirdUtterance );

    await timeout( timeForFirstUtterance + timeForSecondUtterance + timeForThirdUtterance + TIMING_BUFFER * 3 );
    assert.ok( alerts.length === 3, 'Three basic Utterances went through the queue' );
  } );

  QUnit.test( 'cancelUtterance tests', async assert => {

    // Test that cancelUtterance will not introduce a memory leak with multiple listeners on the Property
    await resetQueueAndAnnouncer();

    testVoicingUtteranceQueue.addToBack( firstUtterance );
    await timeout( timeForFirstUtterance / 2 );
    testVoicingManager.cancelUtterance( firstUtterance );

    // Make sure that we handle the `end` event happening asynchronously from the cancel, this should not crash
    testVoicingUtteranceQueue.addToBack( firstUtterance );
    assert.ok( alerts[ 0 ] === firstUtterance, 'firstUtterance was cancelled' );
    assert.ok( testVoicingUtteranceQueue.queue.length === 1, 'There is one Utterance in the queue' );
  } );

  QUnit.test( 'Interrupt from priority change', async assert => {

    // Add all 3 to back
    testVoicingUtteranceQueue.addToBack( firstUtterance );
    testVoicingUtteranceQueue.addToBack( secondUtterance );
    testVoicingUtteranceQueue.addToBack( thirdUtterance );

    assert.ok( testVoicingUtteranceQueue.queue.length === 3, 'All three utterances in the queue' );

    await timeout( timeForFirstUtterance / 2 );
    assert.ok( alerts.length === 0, 'Not enough time for any to be spoken yet.' );
    assert.ok( testVoicingUtteranceQueue.queue.length === 2, 'First utterances given to the announcer, two remain' );
    assert.ok( testVoicingManager.currentlySpeakingUtterance === firstUtterance, 'voicingManager speaking firstUtterance' );

    // this should interrupt the first one and we should hear the second and third utterances in full
    secondUtterance.priorityProperty.value = 2;

    // The start/end events for utterances fire asynchronously after a cancel so we need to wait a bit
    // to verify that the firstUtterance was cancelled
    await timeout( TIMING_BUFFER );
    assert.ok( alerts.length === 1 && alerts[ 0 ] === firstUtterance, 'firstUtterance should be interrupted and end' );

    // currentlySpeakingUtterance is set after speech starts, which happens asynchronously on some browsers,
    // give the secondUtterance some time to start speaking before checking state of queue and announcer
    await timeout( timeForSecondUtterance / 2 );
    assert.ok( testVoicingUtteranceQueue.queue.length === 1, 'only thirdUtterance remains in the queue, secondUtterance may not have been spoken yet because of delaying readyToAnnounce' );
    assert.ok( testVoicingManager.currentlySpeakingUtterance === secondUtterance, 'voicingManager speaking secondUtterance' );

    // time for second utterance to finish and third utterance to start
    await timeout( timeForSecondUtterance / 2 + timeForThirdUtterance / 2 );
    assert.ok( alerts.length === 2 && alerts[ 0 ] === secondUtterance, 'secondUtterance finished speaking' );
    assert.ok( testVoicingUtteranceQueue.queue.length === 0, 'All utterances out of the queue, third one should be given to the Announcer.' );
    assert.ok( testVoicingManager.currentlySpeakingUtterance === thirdUtterance, 'voicingManager speaking thirdUtterance' );

    // the full time for the thirdUtterance should be plenty of time here
    await timeout( timeForThirdUtterance );
    assert.ok( alerts.length === 3, 'thirdUtterance should be spoken' );
  } );

  QUnit.test( 'announceImmediately with priorityProperty', async assert => {

    testVoicingUtteranceQueue.announceImmediately( firstUtterance );
    assert.ok( testVoicingUtteranceQueue.queue.length === 0, 'announceImmediately should be synchronous with voicingManager for an empty queue' );

    await timeout( timeForFirstUtterance / 2 );
    assert.ok( testVoicingManager.currentlySpeakingUtterance === firstUtterance, 'first utterance spoken immediately' );

    await resetQueueAndAnnouncer();

    testVoicingUtteranceQueue.addToBack( firstUtterance );
    testVoicingUtteranceQueue.addToBack( secondUtterance );
    testVoicingUtteranceQueue.addToBack( thirdUtterance );

    // now speak the first utterance immediately
    testVoicingUtteranceQueue.announceImmediately( firstUtterance );

    await timeout( timeForFirstUtterance / 2 );
    assert.ok( testVoicingUtteranceQueue.queue.length === 2, 'announcing firstUtterance immediately should remove the duplicate firstUtterance in the queue' );
    assert.ok( testVoicingManager.currentlySpeakingUtterance === firstUtterance, 'first utterance is being spoken after announceImmediately' );

    //--------------------------------------------------------------------------------------------------
    // Verify that announceImmediately has no output when something else in the queue has higher priority
    //--------------------------------------------------------------------------------------------------
    await resetQueueAndAnnouncer();

    testVoicingUtteranceQueue.addToBack( firstUtterance );
    testVoicingUtteranceQueue.addToBack( secondUtterance );

    firstUtterance.priorityProperty.value = 2;
    thirdUtterance.priorityProperty.value = 1;
    testVoicingUtteranceQueue.announceImmediately( thirdUtterance );

    // thirdUtterance is lower priority than next item in the queue, it should not be spoken and should not be
    // in the queue at all
    assert.ok( testVoicingUtteranceQueue.queue.length === 2, 'only first and second utterances in the queue' );
    assert.ok( !testVoicingUtteranceQueue.queue.includes( thirdUtterance ), 'thirdUtterance not in queue after announceImmediately' );

    await timeout( timeForFirstUtterance / 2 );
    assert.ok( testVoicingManager.currentlySpeakingUtterance === firstUtterance );
    assert.ok( alerts[ 0 ] !== thirdUtterance, 'thirdUtterance was not spoken with announceImmediately' );

    //--------------------------------------------------------------------------------------------------
    // Verify that announceImmediately does not interrupt an Utterance being spoken with higher priority
    //--------------------------------------------------------------------------------------------------
    await resetQueueAndAnnouncer();
    firstUtterance.priorityProperty.value = 1;
    thirdUtterance.priorityProperty.value = 1;

    testVoicingUtteranceQueue.addToBack( firstUtterance );
    testVoicingUtteranceQueue.addToBack( secondUtterance );

    firstUtterance.priorityProperty.value = 2;
    thirdUtterance.priorityProperty.value = 1;

    await timeout( timeForFirstUtterance / 2 );
    testVoicingUtteranceQueue.announceImmediately( thirdUtterance );

    // thirdUtterance is lower priority than what is currently being spoken so it should NOT be heard
    await timeout( timeForFirstUtterance / 4 ); // less than remaining time for firstUtterance checking for interruption
    assert.ok( testVoicingManager.currentlySpeakingUtterance !== thirdUtterance, 'announceImmediately should not interrupt a higher priority utterance' );
    assert.ok( !testVoicingUtteranceQueue.queue.includes( thirdUtterance ), 'lower priority thirdUtterance should be dropped from the queue' );

    //--------------------------------------------------------------------------------------------------
    // The Utterance spoken with announceImmediately should be interrupted if its priority is reduced
    // below another item in the queue
    //--------------------------------------------------------------------------------------------------
    await resetQueueAndAnnouncer();
    firstUtterance.priorityProperty.value = 2;
    thirdUtterance.priorityProperty.value = 2;

    testVoicingUtteranceQueue.addToBack( firstUtterance );
    testVoicingUtteranceQueue.addToBack( secondUtterance );
    testVoicingUtteranceQueue.announceImmediately( thirdUtterance );

    await timeout( timeForThirdUtterance / 2 );
    assert.ok( testVoicingManager.currentlySpeakingUtterance === thirdUtterance, 'thirdUtterance is announced immediately' );

    thirdUtterance.priorityProperty.value = 1;

    // the priority of the thirdUtterance is reduced while being spoken from announceImmediately, it should be
    // interrupted and the next item in the queue should be spoken
    await timeout( timeForThirdUtterance / 4 ); // less than the remaining time for third utterance for interruption
    assert.ok( alerts[ 0 ] === thirdUtterance, 'third utterance was interrupted by reducing its priority' );

    await timeout( timeForFirstUtterance / 2 );
    assert.ok( testVoicingManager.currentlySpeakingUtterance === firstUtterance, 'moved on to next utterance in queue' );

    //--------------------------------------------------------------------------------------------------
    // The Utterance spoken with announceImmediately gets interrupted when another Utterance in the
    // queue is made higher priority.
    //--------------------------------------------------------------------------------------------------
    await resetQueueAndAnnouncer();
    firstUtterance.priorityProperty.value = 1;
    thirdUtterance.priorityProperty.value = 1;

    testVoicingUtteranceQueue.addToBack( firstUtterance );
    testVoicingUtteranceQueue.addToBack( secondUtterance );
    testVoicingUtteranceQueue.announceImmediately( thirdUtterance );

    await timeout( timeForThirdUtterance / 2 );
    assert.ok( testVoicingManager.currentlySpeakingUtterance === thirdUtterance, 'thirdUtterance is announced immediately' );

    firstUtterance.priorityProperty.value = 2;

    // the priority of firstUtterance is increased so the utterance of announceImmediately should be interrupted
    await timeout( timeForThirdUtterance / 4 ); // less than remaining time for third utterance for interruption
    assert.ok( alerts[ 0 ] === thirdUtterance, 'third utterance was interrupted by the next Utterance increasing priority' );

    await timeout( timeForFirstUtterance / 2 );
    assert.ok( testVoicingManager.currentlySpeakingUtterance === firstUtterance, 'moved on to higher priority utterance in queue' );

    //--------------------------------------------------------------------------------------------------
    // announceImmediately should interrupt another utterance if the new utterance is hof higher priority
    //--------------------------------------------------------------------------------------------------
    await resetQueueAndAnnouncer();
    firstUtterance.priorityProperty.value = 1;
    thirdUtterance.priorityProperty.value = 2;

    testVoicingUtteranceQueue.addToBack( firstUtterance );
    testVoicingUtteranceQueue.addToBack( secondUtterance );

    await timeout( timeForFirstUtterance / 2 );
    testVoicingUtteranceQueue.announceImmediately( thirdUtterance );

    await timeout( timeForFirstUtterance / 4 ); // should not be enough time for firstUtterance to finish
    assert.ok( alerts[ 0 ] === firstUtterance, 'firstUtterance interrupted because it had lower priority' );

    await timeout( timeForThirdUtterance / 2 );
    assert.ok( testVoicingManager.currentlySpeakingUtterance === thirdUtterance, 'thirdUtterance spoken immediately' );

    //--------------------------------------------------------------------------------------------------
    // announceImmediately will NOT interrupt another utterance being spoken with equal priority
    //--------------------------------------------------------------------------------------------------
    await resetQueueAndAnnouncer();
    firstUtterance.priorityProperty.value = 1;
    thirdUtterance.priorityProperty.value = 1;

    testVoicingUtteranceQueue.addToBack( firstUtterance );
    testVoicingUtteranceQueue.addToBack( secondUtterance );

    await timeout( timeForFirstUtterance / 2 );
    testVoicingUtteranceQueue.announceImmediately( thirdUtterance );

    await timeout( timeForFirstUtterance / 4 );
    assert.ok( testVoicingManager.currentlySpeakingUtterance === firstUtterance, 'firstUtterance not interrupted, it has equal priority' );
    assert.ok( testVoicingUtteranceQueue.queue[ 0 ].utterance === thirdUtterance, 'thirdUtterance was added to the front of the queue' );
    assert.ok( testVoicingUtteranceQueue.queue[ 1 ].utterance === secondUtterance, 'secondUtterance still in queue' );

    await timeout( timeForFirstUtterance / 4 + timeForThirdUtterance / 2 );
    assert.ok( alerts[ 0 ] === firstUtterance, 'firstUtterance spoken in full' );
    assert.ok( testVoicingManager.currentlySpeakingUtterance === thirdUtterance, 'thirdUtterance was spoken next' );
  } );
}
