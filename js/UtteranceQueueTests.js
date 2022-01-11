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

// When we want to add a little time to make that an interval has completed.0
const TIMING_BUFFER = VOICING_UTTERANCE_INTERVAL + 50;

const testVoicingManager = new voicingManager.constructor();
const testVoicingUtteranceQueue = new UtteranceQueue( testVoicingManager );

testVoicingManager.initialize();
testVoicingManager.enabledProperty.value = true;

// Make the voices faster so that tests don't take too long and are quiet
testVoicingManager.voiceRateProperty.value = 2;

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
  alert: 'first utterance',
  alertStableDelay: 0,
  announcerOptions: noCancelOptions
} );
const secondUtterance = new Utterance( {
  alert: 'second utterance',
  alertStableDelay: 0,
  announcerOptions: noCancelOptions
} );

const thirdUtterance = new Utterance( {
  alert: 'third utterance',
  alertStableDelay: 0,
  announcerOptions: noCancelOptions
} );

let timeForFirstUtterance;
let timeForSecondUtterance;
let timeForThirdUtterance;

let intervalID = null;
QUnit.module( 'UtteranceQueue', {
  before: async () => {

    // timer step in seconds, stepped every 10 millisecond
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

      if ( timeForFirstUtterance + timeForSecondUtterance + timeForThirdUtterance < 2000 ) {
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

    await timeout( TIMING_BUFFER );

    assert.ok( alerts.length === 1 && alerts[ 0 ] === firstUtterance, 'firstUtterance should be interrupted and end' );
    assert.ok( testVoicingUtteranceQueue.queue.length === 1, 'only thirdUtterance remains in the queue' );

    // Our test is not consistent enough to get this right across browsers and runtimes
    // assert.ok( testVoicingManager.currentlySpeakingUtterance === secondUtterance, 'voicingManager speaking secondUtterance' );

    await timeout( timeForSecondUtterance + TIMING_BUFFER );
    assert.ok( alerts.length === 2 && alerts[ 0 ] === secondUtterance, 'secondUtterance finished speaking' );
    assert.ok( testVoicingUtteranceQueue.queue.length === 0, 'All utterances out of the queue, third one should be given to the Announcer.' );

    // Our test is not consistent enough to get this right across browsers and runtimes
    // assert.ok( testVoicingManager.currentlySpeakingUtterance === thirdUtterance, 'voicingManager speaking thirdUtterance' );

    await timeout( timeForThirdUtterance + TIMING_BUFFER );
    assert.ok( alerts.length === 3, 'thirdUtterance should be spoken' );
  } );
}
