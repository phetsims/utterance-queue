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
  // timing variables related to waiting for voicingManager to be readyToSpeak have enough time to reset
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
  beforeEach() {

    // clear the alerts before each new test
    alerts = [];
    testVoicingUtteranceQueue.clear();
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

    await timeout( 5000 );
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

    // if we do this, it would interrupt the first one and we should hear the second and third utterances in full
    secondUtterance.priorityProperty.value = 2;

    // The start/end events for utterances fire asynchronously after a cancel so we need to wait a bit
    // to verify that the firstUtterance was cancelled
    await timeout( TIMING_BUFFER );
    assert.ok( alerts.length === 1 && alerts[ 0 ] === firstUtterance, 'firstUtterance should be interrupted and end' );

    // currentlySpeakingUtterance is set after speech starts, which happens asynchronously on some browsers,
    // give the secondUtterance some time to start speaking before checking state of queue and announcer
    await timeout( timeForSecondUtterance / 2 );
    assert.ok( testVoicingUtteranceQueue.queue.length === 1, 'only thirdUtterance remains in the queue, secondUtterance may not have been spoken yet because of delaying readyToSpeak' );
    assert.ok( testVoicingManager.currentlySpeakingUtterance === secondUtterance, 'voicingManager speaking secondUtterance' );

    await timeout( timeForSecondUtterance / 2 + TIMING_BUFFER );
    assert.ok( alerts.length === 2 && alerts[ 0 ] === secondUtterance, 'secondUtterance finished speaking' );
    assert.ok( testVoicingUtteranceQueue.queue.length === 0, 'All utterances out of the queue, third one should be given to the Announcer.' );

    await timeout( timeForThirdUtterance / 2 );
    assert.ok( testVoicingManager.currentlySpeakingUtterance === thirdUtterance, 'voicingManager speaking thirdUtterance' );

    // the full time for the thirdUtterance should be plenty of time here
    await timeout( timeForThirdUtterance );
    assert.ok( alerts.length === 3, 'thirdUtterance should be spoken' );
  } );

  QUnit.test( 'announceImmediately with priorityProperty', async assert => {

    // Add all 3 to back
    testVoicingUtteranceQueue.addToBack( firstUtterance );
    testVoicingUtteranceQueue.addToBack( secondUtterance );
    testVoicingUtteranceQueue.addToBack( thirdUtterance );

    assert.ok( testVoicingUtteranceQueue.queue.length === 3, 'All three utterances in the queue' );

    // now speak the first utterance immediately
    testVoicingUtteranceQueue.announceImmediately( firstUtterance );

    await timeout( timeForFirstUtterance / 2 );

    // this should have no impact on the queue (should not remove the duplicate firstUtterance that is already in queue
    assert.ok( testVoicingUtteranceQueue.queue.length >= 3, 'announcing firstUtterance immediately has no impact on existing queue' );


  } );
}
