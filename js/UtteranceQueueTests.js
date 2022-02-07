// Copyright 2022, University of Colorado Boulder

/**
 * QUnit tests for Utterance and UtteranceQueue that use voicingManager as the Announcer.
 *
 * @author Michael Kauzmann (PhET Interactive Simulations)
 * @author Jesse Greenberg (PhET Interactive Simulations)
 */

import stepTimer from '../../axon/js/stepTimer.js';
import { Display, voicingManager } from '../../scenery/js/imports.js';
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

testVoicingManager.initialize( Display.userGestureEmitter );
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
 * @param {boolean} [clearAlerts] - if true, we will also clear the alerts array (which holds utterances that have
 *                                  left the UtteranceQueue)for the next test
 */

let timeForFirstUtterance;
let timeForSecondUtterance;
let timeForThirdUtterance;

let intervalID = null;
QUnit.module( 'UtteranceQueue', {
  before: async () => {

    // timer step in seconds, stepped 60 times per second
    const timerInterval = 1 / 60;

    // step the timer, because utteranceQueue runs on timer
    let previousTime = Date.now(); // in ms
    intervalID = setInterval( () => { // eslint-disable-line bad-sim-text

      // in ms
      const currentTime = Date.now();
      const elapsedTime = currentTime - previousTime;

      stepTimer.emit( elapsedTime / 1000 ); // step timer in seconds

      previousTime = currentTime;
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

      // Make sure that speech synthesis is enabled and the Utterances are long enough for timing tests to be
      // consistent. Note that speech is faster or slower depending on your browser. Currently the test
      // utterances take ~1400 ms on Safari and ~2000 ms on Chrome.
      if ( timeForFirstUtterance < 1200 || timeForSecondUtterance < 1200 || timeForThirdUtterance < 1200 ) {
        console.log( `timeForFirstUtterance: ${timeForFirstUtterance}, timeForThirdUtterance: ${timeForSecondUtterance}, timeForThirdUtterane: ${timeForThirdUtterance}` );
        throw new Error( 'time for Utterances is too short, did you click in the window before the first test started?' );
      }
    }

    alerts = [];
  },
  beforeEach: async () => {

    testVoicingUtteranceQueue.cancel();

    // all have default priority for the next test
    firstUtterance.priorityProperty.value = 1;
    secondUtterance.priorityProperty.value = 1;
    thirdUtterance.priorityProperty.value = 1;

    // Give plenty of time for the Announcer to be ready to speak again. For some reason this needs to be a really
    // large number to get tests to pass consistently. I am starting to have a hunch that QUnit tries to run
    // async tests in parallel...
    await timeout( TIMING_BUFFER * 3 );

    // From debugging, I am not convinced that setInterval is called consistently while we wait for timeouts. Stepping
    // the timer here improves consistency and gets certain tests passing. Specifically, I want to make sure that
    // timing variables related to waiting for voicingManager to be readyToAnnounce have enough time to reset
    stepTimer.emit( TIMING_BUFFER * 3 );

    responseCollector.reset();

    // clear the alerts before each new test
    alerts = [];
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
    testVoicingUtteranceQueue.addToBack( firstUtterance );
    await timeout( timeForFirstUtterance / 2 );
    testVoicingUtteranceQueue.cancelUtterance( firstUtterance );

    // Make sure that we handle the `end` event happening asynchronously from the cancel, this should not crash
    testVoicingUtteranceQueue.addToBack( firstUtterance );
    assert.ok( alerts[ 0 ] === firstUtterance, 'firstUtterance was cancelled' );
    assert.ok( testVoicingUtteranceQueue.queue.length === 1, 'There is one Utterance in the queue' );
  } );

  QUnit.test( 'PriorityProperty interruption', async assert => {

    // Add all 3 to back
    testVoicingUtteranceQueue.addToBack( firstUtterance );
    testVoicingUtteranceQueue.addToBack( secondUtterance );
    testVoicingUtteranceQueue.addToBack( thirdUtterance );

    assert.ok( testVoicingUtteranceQueue.queue.length === 3, 'All three utterances in the queue' );

    // make the third Utterance high priority, it should remove the other two Utterances
    thirdUtterance.priorityProperty.value = 2;
    assert.ok( testVoicingUtteranceQueue.queue.length === 1, 'Only the one Utterance remains' );
    assert.ok( testVoicingUtteranceQueue.queue[ 0 ].utterance === thirdUtterance, 'Only the third Utterance remains' );
  } );

  QUnit.test( 'Announced Utterance can also be in queue and interruption during announcement', async assert => {

    // while an Utterance is being announced, make sure that we can add the same Utterance to the queue and that
    // priorityProperty is still observed
    testVoicingUtteranceQueue.addToBack( firstUtterance );
    await timeout( timeForFirstUtterance / 2 );
    testVoicingUtteranceQueue.addToBack( firstUtterance );
    testVoicingUtteranceQueue.addToBack( secondUtterance );
    await timeout( timeForFirstUtterance ); // Time to get halfway through second announcement of firstUtterance

    // reduce priorityProperty of firstUtterance while it is being announced, secondUtterance should interrupt
    firstUtterance.priorityProperty.value = 0;
    await timeout( timeForSecondUtterance / 2 );
    assert.ok( testVoicingManager.currentlySpeakingUtterance === secondUtterance, 'Utterance being announced still observes priorityProperty' );
    assert.ok( testVoicingUtteranceQueue.queue.length === 0, 'queue empty after interruption and sending secondUtterance to Announcer' );
  } );

  QUnit.test( 'Higher priority removes earlier Utterances from queue', async assert => {

    // Unit test cases taken from examples that demonstrated the priorityProperty feature in
    // https://github.com/phetsims/utterance-queue/issues/50
    //------------------------------------------------------------------------------------------------------------------

    // Add all 3 to back
    testVoicingUtteranceQueue.addToBack( firstUtterance );
    testVoicingUtteranceQueue.addToBack( secondUtterance );
    testVoicingUtteranceQueue.addToBack( thirdUtterance );
    assert.ok( testVoicingUtteranceQueue.queue.length === 3, 'All three utterances in the queue' );

    secondUtterance.priorityProperty.value = 2;

    // enough time for the secondUtterance to start speaking while the firstUtterance was just removed from the queue
    await timeout( timeForSecondUtterance / 2 );
    assert.ok( testVoicingManager.currentlySpeakingUtterance === secondUtterance, 'The secondUtterance interrupted the firstUtterance because it is higher priority.' );

    // enough time to finish the secondUtterance and start speaking the thirdUtterance
    await timeout( timeForSecondUtterance / 2 + timeForThirdUtterance / 2 );
    assert.ok( alerts[ 0 ] === secondUtterance, 'secondUtterance spoken in full' );
    assert.ok( testVoicingManager.currentlySpeakingUtterance === thirdUtterance, 'thirdUtterance spoken after secondUtterance finished' );
    //------------------------------------------------------------------------------------------------------------------
  } );

  QUnit.test( 'Utterance removed because of self priority reduction before another is added to queue', async assert => {

    firstUtterance.priorityProperty.value = 10;
    testVoicingUtteranceQueue.addToBack( firstUtterance );

    // reduce priorityProperty before adding thirdUtterance to queue
    firstUtterance.priorityProperty.value = 0;
    testVoicingUtteranceQueue.addToBack( thirdUtterance );

    // enough time to start speaking either the first or third Utterances
    await timeout( timeForFirstUtterance / 2 );
    assert.ok( testVoicingManager.currentlySpeakingUtterance === thirdUtterance, 'thirdUtterance spoken because firstUtterance.priorityProperty was reduced before adding thirdUtterance to the queue' );
  } );

  QUnit.test( 'Utterance removed because of self priority reduction after another is added to queue', async assert => {

    firstUtterance.priorityProperty.value = 10;
    testVoicingUtteranceQueue.addToBack( firstUtterance );

    // reduce priorityProperty AFTER adding thirdUtterance to queue
    testVoicingUtteranceQueue.addToBack( thirdUtterance );
    firstUtterance.priorityProperty.value = 0;

    // enough time to start speaking either the first or third Utterances
    await timeout( timeForFirstUtterance / 2 );
    assert.ok( testVoicingManager.currentlySpeakingUtterance === thirdUtterance, 'thirdUtterance spoken because firstUtterance.priorityProperty was reduced after adding thirdUtterance to the queue' );
  } );

  QUnit.test( 'Utterance interruption because self priority reduced while being announced', async assert => {

    firstUtterance.priorityProperty.value = 10;
    testVoicingUtteranceQueue.addToBack( firstUtterance );
    testVoicingUtteranceQueue.addToBack( thirdUtterance );

    await timeout( timeForFirstUtterance / 2 );
    assert.ok( testVoicingManager.currentlySpeakingUtterance === firstUtterance );

    // reducing priority below third utterance should interrupt firstUtterance for thirdUtterance
    firstUtterance.priorityProperty.value = 0;

    // not enough time for firstUtterance to finish in full, but enough time to verify that it was interrupted
    await timeout( timeForFirstUtterance / 4 );
    assert.ok( alerts[ 0 ] === firstUtterance, 'firstUtterance was interrupted because its priority was reduced while it was being announced' );

    // enough time for thirdUtterance to start speaking
    await timeout( timeForThirdUtterance / 2 );
    assert.ok( testVoicingManager.currentlySpeakingUtterance === thirdUtterance, 'thirdUtterance being announced after interrupting firstUtterance' );
  } );

  QUnit.test( 'Utterance interruption during annoumcement because another in the queue made higher priority', async assert => {

    firstUtterance.priorityProperty.value = 0;
    thirdUtterance.priorityProperty.value = 0;

    testVoicingUtteranceQueue.addToBack( firstUtterance );
    testVoicingUtteranceQueue.addToBack( thirdUtterance );

    await timeout( timeForFirstUtterance / 2 );
    assert.ok( testVoicingManager.currentlySpeakingUtterance === firstUtterance, 'firstUtterance being announced' );

    // increasing priority of thirdUtterance in the queue should interrupt firstUtterance being announced
    thirdUtterance.priorityProperty.value = 3;

    // not enough time for firstUtterance to finish, but enough to make sure that it was interrupted
    await timeout( timeForFirstUtterance / 4 );
    assert.ok( alerts[ 0 ] === firstUtterance, 'firstUtterance was interrupted because an Utterance in the queue was made higher priority' );

    // enough time for thirdUtterance to start speaking
    await timeout( timeForThirdUtterance / 2 );
    assert.ok( testVoicingManager.currentlySpeakingUtterance === thirdUtterance, 'thirdUtterance being announced after interrupting firstUtterance' );
  } );

  QUnit.test( 'Utterance NOT interrupted because self priority still relatively higher', async assert => {

    firstUtterance.priorityProperty.value = 10;
    testVoicingUtteranceQueue.addToBack( firstUtterance );
    testVoicingUtteranceQueue.addToBack( thirdUtterance );

    await timeout( timeForFirstUtterance / 2 );

    // we should still hear both Utterances in full, new priority for firstUtterance is higher than thirdUtterance
    firstUtterance.priorityProperty.value = 5;

    // not enough time for firstUtterance to finish, but enough to make sure that it was not interrupted
    await timeout( timeForFirstUtterance / 10 );
    assert.ok( alerts.length === 0, 'firstUtterance was not interrupted because priority was set to a value higher than next utterance in queue' );

    // enough time for thirdUtterance to start speaking after firstUtterance finishes
    await timeout( timeForThirdUtterance / 2 + timeForFirstUtterance / 2 );
    assert.ok( alerts[ 0 ] === firstUtterance, 'firstUtterance finished being announced' );
    assert.ok( testVoicingManager.currentlySpeakingUtterance === thirdUtterance, 'thirdUtterance being announced after waiting for firstUtterance' );
  } );

  QUnit.test( 'announceImmediately', async assert => {

    testVoicingUtteranceQueue.announceImmediately( firstUtterance );
    assert.ok( testVoicingUtteranceQueue.queue.length === 0, 'announceImmediately should be synchronous with voicingManager for an empty queue' );

    await timeout( timeForFirstUtterance / 2 );
    assert.ok( testVoicingManager.currentlySpeakingUtterance === firstUtterance, 'first utterance spoken immediately' );
  } );

  QUnit.test( 'announceImmediately reduces duplicate Utterances in queue', async assert => {

    testVoicingUtteranceQueue.addToBack( firstUtterance );
    testVoicingUtteranceQueue.addToBack( secondUtterance );
    testVoicingUtteranceQueue.addToBack( thirdUtterance );

    // now speak the first utterance immediately
    testVoicingUtteranceQueue.announceImmediately( firstUtterance );

    await timeout( timeForFirstUtterance / 2 );
    assert.ok( testVoicingUtteranceQueue.queue.length === 2, 'announcing firstUtterance immediately should remove the duplicate firstUtterance in the queue' );
    assert.ok( testVoicingManager.currentlySpeakingUtterance === firstUtterance, 'first utterance is being spoken after announceImmediately' );
  } );

  QUnit.test( 'announceImmediately does nothing when Utterance has low priority relative to queued Utterances', async assert => {
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
  } );

  QUnit.test( 'anounceImmediatelety does nothing when Utterance has low priority relative to announcing Utterance', async assert => {
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
  } );

  QUnit.test( 'Utterance spoken with announceImmediately should be interrupted if priority is reduced', async assert => {

    //--------------------------------------------------------------------------------------------------
    // The Utterance spoken with announceImmediately should be interrupted if its priority is reduced
    // below another item in the queue
    //--------------------------------------------------------------------------------------------------
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
  } );

  QUnit.test( 'Utterance spoken by announceImmediately is interrupted by raising priority of queued utterance', async assert => {
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
  } );

  QUnit.test( 'announceImmediately interrupts another Utterance if new Utterance is high priority', async assert => {
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
  } );

  QUnit.test( 'announceImmediately will not interrupt Utterance of equal priority ', async assert => {
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
