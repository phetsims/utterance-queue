// Copyright 2021-2022, University of Colorado Boulder

/**
 * QUnit tests for ResponsePacket
 *
 * @author Michael Kauzmann (PhET Interactive Simulations)
 */

import ResponsePacket from './ResponsePacket.js';

QUnit.module( 'ResponsePacket' );

QUnit.test( 'ResponsePacket.copy()', async assert => {

  let x = new ResponsePacket( {
    nameResponse: 'nameResponse',
    objectResponse: 'objectResponse',
    contextResponse: 'contextResponse'
  } );

  const testIt = ( message: string ) => {

    assert.ok( x.nameResponse === 'nameResponse', `nameResponse: ${message}` );
    assert.ok( x.objectResponse === 'objectResponse', `objectResponse: ${message}` );
    assert.ok( x.contextResponse === 'contextResponse', `contextResponse: ${message}` );
    assert.ok( x.hintResponse === null, `hintResponse: ${message}` );
    assert.ok( x.ignoreProperties === new ResponsePacket().ignoreProperties, `ignoreProperties: ${message}` );
  };

  testIt( 'fromConstructor' );

  x = x.copy();

  testIt( 'fromCopy' );
} );
