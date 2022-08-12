// Copyright 2019-2022, University of Colorado Boulder

/**
 * QUnit tests for Utterance and UtteranceQueue that use AriaLiveAnnouncer as the Announcer.
 *
 * @author Michael Kauzmann (PhET Interactive Simulations)
 */

import stepTimer from '../../axon/js/stepTimer.js';
import AriaLiveAnnouncer from './AriaLiveAnnouncer.js';
import responseCollector from './responseCollector.js';
import ResponsePacket from './ResponsePacket.js';
import Utterance from './Utterance.js';
import UtteranceQueue from './UtteranceQueue.js';

let sleepTiming = 0;

const ariaLiveAnnouncer = new AriaLiveAnnouncer( { respectResponseCollectorProperties: true } );
const utteranceQueue = new UtteranceQueue( ariaLiveAnnouncer );

// helper es6 functions from  https://stackoverflow.com/questions/33289726/combination-of-async-function-await-settimeout/33292942
function timeout( ms: number ): Promise<unknown> {
  return new Promise( resolve => setTimeout( resolve, ms ) ); // eslint-disable-line bad-sim-text
}

let alerts: string[] = [];

let intervalID: number;
QUnit.module( 'Utterance', {
  before() {

    // timer step in seconds, stepped 60 times per second
    const timerInterval = 1 / 60;

    // step the timer, because utteranceQueue runs on timer
    let previousTime = Date.now(); // in ms

    intervalID = window.setInterval( () => { // eslint-disable-line bad-sim-text

      // in ms
      const currentTime = Date.now();
      const elapsedTime = currentTime - previousTime;

      stepTimer.emit( elapsedTime / 1000 ); // step timer in seconds

      previousTime = currentTime;
    }, timerInterval * 1000 );

    // whenever announcing, get a callback and populate the alerts array
    ariaLiveAnnouncer.announcementCompleteEmitter.addListener( utterance => {
      alerts.unshift( utterance[ 'previousAlertText' ] + '' );
    } );

    // slightly slower than the interval that the utteranceQueue will wait so we don't have a race condition
    sleepTiming = AriaLiveAnnouncer.ARIA_LIVE_DELAY * 1.5;
  },
  async beforeEach() {

    // clear the alerts before each new test
    alerts = [];
    utteranceQueue.clear();
    responseCollector.reset();

    // wait for the Announcer to be ready to speak again
    await timeout( sleepTiming );
  },
  after() {
    clearInterval( intervalID! );
  }
} );

QUnit.test( 'Basic Utterance testing', async assert => {

  // for this test, we just want to verify that the alert makes it through to ariaLiveAnnouncer
  const alertContent = 'hi';
  const utterance = new Utterance( {
    alert: alertContent,
    alertStableDelay: 0 // alert as fast as possible
  } );
  utteranceQueue.addToBack( utterance );

  await timeout( sleepTiming );
  assert.ok( alerts[ 0 ] === alertContent, 'first alert made it to ariaLiveAnnouncer' );

  const otherAlert = 'alert';
  utterance.alert = otherAlert;
  utteranceQueue.addToBack( utterance );
  await timeout( sleepTiming );
  assert.ok( alerts[ 0 ] === otherAlert, 'second alert made it to ariaLiveAnnouncer' );

  utterance.reset();
  assert.ok( utterance[ 'previousAlertText' ] === null, 'previousAlertText reset' );
} );

QUnit.test( 'alertStable and alertStableDelay tests', async assert => {
  const highFrequencyUtterance = new Utterance( {
    alert: 'Rapidly Changing',
    alertStableDelay: 0 // we want to hear the utterance every time it is added to the queue
  } );

  const numAlerts = 4;

  // add the utterance to the back many times, by default they should collapse
  for ( let i = 0; i < numAlerts; i++ ) {
    utteranceQueue.addToBack( highFrequencyUtterance );
  }
  assert.ok( utteranceQueue[ 'queue' ].length === 1, 'utterances should collapse by default after addToBack' );

  await timeout( sleepTiming );

  // cleanup step
  assert.ok( utteranceQueue[ 'queue' ].length === 0, 'cleared queue' );

  /////////////////////////////////////////

  alerts = [];
  const stableDelay = sleepTiming * 3.1; // slightly longer than 3x
  const myUtterance = new Utterance( {
    alert: 'hi',
    alertStableDelay: stableDelay
  } );

  for ( let i = 0; i < 100; i++ ) {
    utteranceQueue.addToBack( myUtterance );
  }

  assert.ok( utteranceQueue[ 'queue' ].length === 1, 'same Utterance should override in queue' );
  await timeout( sleepTiming );

  // The wrapper has the timing variables
  const utteranceWrapper = utteranceQueue[ 'queue' ][ 0 ];

  // It is a bit dependent on the system running as to if this sleep time will be too long to flush this one too.
  if ( utteranceWrapper ) {
    assert.ok( utteranceWrapper.stableTime >= utteranceWrapper.timeInQueue, 'utterance should be in queue for at least stableDelay' );

    assert.ok( utteranceQueue[ 'queue' ].length === 1, 'Alert still in queue after waiting less than alertStableDelay but more than stepInterval.' );
  }
  await timeout( stableDelay );

  assert.ok( utteranceQueue[ 'queue' ].length === 0, 'Utterance alerted after alertStableDelay time passed' );
  assert.ok( alerts.length === 1, 'utterance ended up in alerts list' );
  assert.ok( alerts[ 0 ] === myUtterance.alert, 'utterance text matches that which is expected' );
} );

QUnit.test( 'alertMaximumDelay tests', async assert => {
  const rapidlyChanging = 'Rapidly Changing';
  const highFrequencyUtterance = new Utterance( {
    alert: rapidlyChanging,
    alertStableDelay: 200,
    alertMaximumDelay: 300
  } );

  utteranceQueue.addToBack( highFrequencyUtterance );
  assert.ok( utteranceQueue[ 'queue' ].length === 1, 'sanity 1' );
  await timeout( 100 );
  assert.ok( utteranceQueue[ 'queue' ].length === 1, 'still has it, not stable, not max' );
  utteranceQueue.addToBack( highFrequencyUtterance );
  assert.ok( utteranceQueue[ 'queue' ].length === 1, 'sanity 2' );
  await timeout( 100 );
  assert.ok( utteranceQueue[ 'queue' ].length === 1, 'still has it, not stable, not max, 2' );
  utteranceQueue.addToBack( highFrequencyUtterance );
  assert.ok( utteranceQueue[ 'queue' ].length === 1, 'sanity 2' );
  await timeout( 150 );
  assert.ok( utteranceQueue[ 'queue' ].length === 0, 'not stable, but past max' );
  assert.ok( alerts[ 0 ] === rapidlyChanging, 'it was announced' );
} );

QUnit.test( 'announceImmediately', async assert => {
  const myUtteranceText = 'This is my utterance text';
  const myUtterance = new Utterance( { alert: myUtteranceText } );

  utteranceQueue.announceImmediately( myUtterance );
  assert.ok( utteranceQueue[ 'queue' ].length === 0, 'should not be added to the queue' );
  assert.ok( alerts[ 0 ] === myUtteranceText, 'should be immediately alerted' );

  utteranceQueue.addToBack( myUtterance );
  assert.ok( utteranceQueue[ 'queue' ].length === 1, 'one added to the queue' );
  assert.ok( alerts.length === 1, 'still just one alert occurred' );
  utteranceQueue.announceImmediately( myUtterance );
  assert.ok( utteranceQueue[ 'queue' ].length === 1, 'announceImmediately removed duplicates, but myUtterance still in queue' );
  await timeout( sleepTiming );
  assert.ok( alerts.length === 2, 'myUtterance announced immediately when Announcer was ready' );
  assert.ok( alerts[ 0 ] === myUtteranceText, 'announceImmediately Utterance was last alert' );
} );


QUnit.test( 'ResponsePacket tests', async assert => {
  responseCollector.nameResponsesEnabledProperty.value = true;
  responseCollector.objectResponsesEnabledProperty.value = true;
  responseCollector.contextResponsesEnabledProperty.value = true;
  responseCollector.hintResponsesEnabledProperty.value = true;

  const NAME = 'name';
  const OBJECT = 'object';
  const CONTEXT = 'context';
  const HINT = 'hint';
  const utterance = new Utterance( {
    alertStableDelay: 0,
    alert: new ResponsePacket( {
      nameResponse: NAME,
      objectResponse: OBJECT,
      contextResponse: CONTEXT,
      hintResponse: HINT
    } )
  } );

  utteranceQueue.addToBack( utterance );
  await timeout( sleepTiming );

  assert.ok( alerts[ 0 ].includes( NAME ), 'name expected' );
  assert.ok( alerts[ 0 ].includes( OBJECT ), 'object expected' );
  assert.ok( alerts[ 0 ].includes( CONTEXT ), 'context expected' );
  assert.ok( alerts[ 0 ].includes( HINT ), 'hint expected' );

  responseCollector.nameResponsesEnabledProperty.value = false;

  utteranceQueue.addToBack( utterance );
  await timeout( sleepTiming );

  assert.ok( !alerts[ 0 ].includes( NAME ), 'name expected' );
  assert.ok( alerts[ 0 ].includes( OBJECT ), 'object expected' );
  assert.ok( alerts[ 0 ].includes( CONTEXT ), 'context expected' );
  assert.ok( alerts[ 0 ].includes( HINT ), 'hint expected' );

  responseCollector.nameResponsesEnabledProperty.value = false;
  responseCollector.objectResponsesEnabledProperty.value = false;
  responseCollector.contextResponsesEnabledProperty.value = false;
  responseCollector.hintResponsesEnabledProperty.value = true; // need something in order to alert

  utteranceQueue.addToBack( utterance );
  await timeout( sleepTiming );

  assert.ok( !alerts[ 0 ].includes( NAME ), 'name not expected' );
  assert.ok( !alerts[ 0 ].includes( OBJECT ), 'object not expected' );
  assert.ok( !alerts[ 0 ].includes( CONTEXT ), 'context not expected' );
  assert.ok( alerts[ 0 ] === HINT, 'hint expected' );
} );
