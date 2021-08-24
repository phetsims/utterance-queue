// Copyright 2019-2021, University of Colorado Boulder

/**
 * QUnit tests for Utterance and utteranceQueue
 *
 * @author Michael Kauzmann (PhET Interactive Simulations)
 */

import stepTimer from '../../axon/js/stepTimer.js';
import AriaHerald from './AriaHerald.js';
import responseCollector from './responseCollector.js';
import ResponsePacket from './ResponsePacket.js';
import Utterance from './Utterance.js';
import UtteranceQueue from './UtteranceQueue.js';

let sleepTiming = null;

const ariaHerald = new AriaHerald( { respectResponseCollectorProperties: true } );
const utteranceQueue = new UtteranceQueue( ariaHerald );

// helper es6 functions from  https://stackoverflow.com/questions/33289726/combination-of-async-function-await-settimeout/33292942
function timeout( ms ) {
  return new Promise( resolve => setTimeout( resolve, ms ) ); // eslint-disable-line bad-sim-text
}

let alerts = [];

let intervalID = null;
QUnit.module( 'Utterance', {
  before() {

    // timer step in seconds, stepped every 10 millisecond
    const timerInterval = 1 / 15;

    // step the timer, because utteranceQueue runs on timer
    intervalID = setInterval( () => { // eslint-disable-line bad-sim-text
      stepTimer.emit( timerInterval ); // step timer in seconds
    }, timerInterval * 1000 );

    // whenever announcing, get a callback and populate the alerts array
    ariaHerald.announcingEmitter.addListener( text => {
      alerts.unshift( text );
    } );

    // slightly slower than the interval that the utteranceQueue will wait so we don't have a race condition
    sleepTiming = timerInterval * 1000 * 1.1;
  },
  beforeEach() {

    // clear the alerts before each new test
    alerts = [];
    utteranceQueue.clear();
    responseCollector.reset();
  },
  after() {
    clearInterval( intervalID );
  }
} );

QUnit.test( 'Basic Utterance testing', async assert => {

  // for this test, we just want to verify that the alert makes it through to ariaHerald
  const alertContent = 'hi';
  const utterance = new Utterance( {
    alert: alertContent,
    alertStableDelay: 0 // alert as fast as possible
  } );
  utteranceQueue.addToBack( utterance );

  await timeout( sleepTiming );
  assert.ok( alerts[ 0 ] === alertContent, 'first alert made it to ariaHerald' );

  const otherAlert = 'alert';
  utterance.alert = otherAlert;
  utteranceQueue.addToBack( utterance );
  await timeout( sleepTiming );
  assert.ok( alerts[ 0 ] === otherAlert, 'second alert made it to ariaHerald' );
} );

QUnit.test( 'Utterance options', async assert => {

  const utterance = new Utterance( {
    alert: [ '1', '2', '3' ],
    alertStableDelay: 0 // alert as fast as possible, we want to hear the utterance every time it is added to the queue
  } );

  const alert4 = async () => {
    for ( let i = 0; i < 4; i++ ) {
      utteranceQueue.addToBack( utterance );
      await timeout( sleepTiming );
    }
  };

  const testOrder = messageSuffix => {

    // newest at lowest index because of unshift
    assert.ok( alerts[ 3 ] === '1', `Array order1${messageSuffix}` );
    assert.ok( alerts[ 2 ] === '2', `Array order2${messageSuffix}` );
    assert.ok( alerts[ 1 ] === '3', `Array order3${messageSuffix}` );
    assert.ok( alerts[ 0 ] === '3', `Array order4${messageSuffix}` );
  };

  await alert4();
  testOrder( '' );
  utterance.reset();
  await alert4();
  testOrder( ', reset should start over' );
  utterance.alert = [ '1', '2', '3' ];
  await alert4();
  testOrder( ', resetting alert should start over' );
} );


QUnit.test( 'Utterance loopAlerts', async assert => {

  const alert = new Utterance( {
    alert: [ '1', '2', '3' ],
    loopAlerts: true,
    alertStableDelay: 0 // we want to hear the utterance every time it is added to the queue
  } );

  const alert7 = async () => {
    for ( let i = 0; i < 7; i++ ) {
      utteranceQueue.addToBack( alert );
      await timeout( sleepTiming );
    }
  };

  const testOrder = messageSuffix => {

    // newest at lowest index
    assert.ok( alerts[ 6 ] === '1', `Array order1${messageSuffix}` );
    assert.ok( alerts[ 5 ] === '2', `Array order2${messageSuffix}` );
    assert.ok( alerts[ 4 ] === '3', `Array order3${messageSuffix}` );
    assert.ok( alerts[ 3 ] === '1', `Array order4${messageSuffix}` );
    assert.ok( alerts[ 2 ] === '2', `Array order5${messageSuffix}` );
    assert.ok( alerts[ 1 ] === '3', `Array order6${messageSuffix}` );
    assert.ok( alerts[ 0 ] === '1', `Array order7${messageSuffix}` );
  };

  await alert7();
  testOrder( '' );
  alert.reset();
  await alert7();
  testOrder( ', reset should start over' );
} );

QUnit.test( 'alertStable and alertStableDelay tests', async assert => {
  const highFrequencyUtterance = new Utterance( { alert: 'Rapidly Changing' } );

  const numAlerts = 4;

  // add the utterance to the back many times, by default they should collapse
  for ( let i = 0; i < numAlerts; i++ ) {
    utteranceQueue.addToBack( highFrequencyUtterance );
  }
  assert.ok( utteranceQueue.queue.length === 1, 'utterances should collapse by default after addToBack' );

  for ( let i = 0; i < numAlerts; i++ ) {
    utteranceQueue.addToFront( highFrequencyUtterance );
  }
  assert.ok( utteranceQueue.queue.length === 1, 'utterances should collapse by default after addToFront' );

  await timeout( sleepTiming * 4 );
  assert.ok( alerts.length === 1, ' we only heard one alert after they became stable' );


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

  assert.ok( utteranceQueue.queue.length === 1, 'same Utterance should override in queue' );
  await timeout( sleepTiming );

  // The wrapper has the timing variables
  const utteranceWrapper = utteranceQueue.queue[ 0 ];
  assert.ok( utteranceWrapper.stableTime >= utteranceWrapper.timeInQueue, 'utterance should be in queue for at least stableDelay' );

  assert.ok( utteranceQueue.queue.length === 1, 'Alert still in queue after waiting less than alertStableDelay but more than stepInterval.' );
  await timeout( stableDelay );

  assert.ok( utteranceQueue.queue.length === 0, 'Utterance alerted after alertStableDelay time passed' );
  assert.ok( alerts.length === 1, 'utterance ended up in alerts list' );
  assert.ok( alerts[ 0 ] === myUtterance.alert, 'utterance text matches that which is expected' );
} );

QUnit.test( 'announceImmediately', async assert => {
  const myUtteranceText = 'This is my utterance text';
  const myUtterance = new Utterance( { alert: myUtteranceText } );

  utteranceQueue.announceImmediately( myUtterance );
  assert.ok( utteranceQueue.queue.length === 0, 'should not be added to the queue' );
  assert.ok( alerts[ 0 ] === myUtteranceText, 'should be immediately alerted' );

  utteranceQueue.addToBack( myUtterance );
  assert.ok( utteranceQueue.queue.length === 1, 'one added to the queue' );
  assert.ok( alerts.length === 1, 'still just one alert occurred' );
  utteranceQueue.announceImmediately( myUtterance );
  assert.ok( utteranceQueue.queue.length === 1, 'that one is still in the queue' );
  assert.ok( alerts.length === 2, 'another alert immediately length' );
  assert.ok( alerts[ 0 ] === myUtteranceText, 'another alert immediately' );
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

  assert.ok( alerts[ 0 ].includes( NAME, 'name expected' ) );
  assert.ok( alerts[ 0 ].includes( OBJECT, 'object expected' ) );
  assert.ok( alerts[ 0 ].includes( CONTEXT, 'context expected' ) );
  assert.ok( alerts[ 0 ].includes( HINT, 'hint expected' ) );

  responseCollector.nameResponsesEnabledProperty.value = false;

  utteranceQueue.addToBack( utterance );
  await timeout( sleepTiming );

  assert.ok( !alerts[ 0 ].includes( NAME, 'name expected' ) );
  assert.ok( alerts[ 0 ].includes( OBJECT, 'object expected' ) );
  assert.ok( alerts[ 0 ].includes( CONTEXT, 'context expected' ) );
  assert.ok( alerts[ 0 ].includes( HINT, 'hint expected' ) );

  responseCollector.nameResponsesEnabledProperty.value = false;
  responseCollector.objectResponsesEnabledProperty.value = false;
  responseCollector.contextResponsesEnabledProperty.value = false;
  responseCollector.hintResponsesEnabledProperty.value = false;

  utteranceQueue.addToBack( utterance );
  await timeout( sleepTiming );

  assert.ok( !alerts[ 0 ].includes( NAME, 'name expected' ) );
  assert.ok( !alerts[ 0 ].includes( OBJECT, 'object expected' ) );
  assert.ok( !alerts[ 0 ].includes( CONTEXT, 'context expected' ) );
  assert.ok( !alerts[ 0 ].includes( HINT, 'hint expected' ) );
} );

QUnit.test( 'ResponsePacket in arrays tests', async assert => {
  responseCollector.nameResponsesEnabledProperty.value = true;
  responseCollector.objectResponsesEnabledProperty.value = true;
  responseCollector.contextResponsesEnabledProperty.value = true;
  responseCollector.hintResponsesEnabledProperty.value = true;

  const NAME = 'name';
  const OBJECT = 'object';
  const CONTEXT = 'context';
  const HINT = 'hint';

  const responsePacket1 = new ResponsePacket( {
    nameResponse: NAME + 1,
    objectResponse: OBJECT + 1,
    contextResponse: CONTEXT + 1,
    hintResponse: HINT + 1
  } );
  const responsePacket2 = new ResponsePacket( {
    nameResponse: NAME + 2,
    objectResponse: OBJECT + 2,
    contextResponse: CONTEXT + 2,
    hintResponse: HINT + 2
  } );

  const utterance = new Utterance( {
    alertStableDelay: 0,
    alert: [ responsePacket1, responsePacket2 ]
  } );

  utteranceQueue.addToBack( utterance );
  await timeout( sleepTiming );

  assert.ok( alerts[ 0 ].includes( NAME, 'name expected' ) );
  assert.ok( alerts[ 0 ].includes( OBJECT, 'object expected' ) );
  assert.ok( alerts[ 0 ].includes( CONTEXT, 'context expected' ) );
  assert.ok( alerts[ 0 ].includes( HINT, 'hint expected' ) );
  assert.ok( alerts[ 0 ].includes( 1, 'should be first responsePacket' ) );

  utteranceQueue.addToBack( utterance );
  await timeout( sleepTiming );

  assert.ok( alerts[ 0 ].includes( NAME, 'name expected' ) );
  assert.ok( alerts[ 0 ].includes( OBJECT, 'object expected' ) );
  assert.ok( alerts[ 0 ].includes( CONTEXT, 'context expected' ) );
  assert.ok( alerts[ 0 ].includes( HINT, 'hint expected' ) );
  assert.ok( alerts[ 0 ].includes( 2, 'should be second responsePacket' ) );

  responseCollector.nameResponsesEnabledProperty.value = false;
  responseCollector.objectResponsesEnabledProperty.value = false;
  responseCollector.contextResponsesEnabledProperty.value = false;
  responseCollector.hintResponsesEnabledProperty.value = true;

  utteranceQueue.addToBack( utterance );
  await timeout( sleepTiming );

  assert.ok( !alerts[ 0 ].includes( NAME, 'name expected' ) );
  assert.ok( !alerts[ 0 ].includes( OBJECT, 'object expected' ) );
  assert.ok( !alerts[ 0 ].includes( CONTEXT, 'context expected' ) );
  assert.ok( alerts[ 0 ].includes( HINT, 'hint expected' ) );
  assert.ok( alerts[ 0 ].includes( 2, 'should be responsePacket 2' ) );

  utterance.reset();
  utterance.loopAlerts = true;

  utteranceQueue.addToBack( utterance );
  await timeout( sleepTiming );
  utteranceQueue.addToBack( utterance );
  await timeout( sleepTiming );
  utteranceQueue.addToBack( utterance );
  await timeout( sleepTiming );

  assert.ok( !alerts[ 0 ].includes( NAME, 'name expected' ) );
  assert.ok( !alerts[ 0 ].includes( OBJECT, 'object expected' ) );
  assert.ok( !alerts[ 0 ].includes( CONTEXT, 'context expected' ) );
  assert.ok( alerts[ 0 ].includes( HINT, 'hint expected' ) );
  assert.ok( alerts[ 0 ].includes( 1, 'should be first responsePacket loop' ) );
  assert.ok( alerts[ 1 ].includes( 2, 'should be second responsePacket loop' ) );
  assert.ok( alerts[ 2 ].includes( 1, 'should be first responsePacket loop again' ) );
} );
