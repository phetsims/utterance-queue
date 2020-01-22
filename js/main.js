// Copyright 2019-2020, University of Colorado Boulder

/**
 * Module that includes all Utterance Queue dependencies, so that requiring this module will return an object
 * that consists of the entire exported 'utteranceQueue' namespace API.
 *
 *@author Michael Kauzmann (PhET Interactive Simulations)
 *@author Taylor Want (PhET Interactive Simulations)
 */
define( require => {
  'use strict';

  const utteranceQueueNamespace = require( 'UTTERANCE_QUEUE/utteranceQueueNamespace' );

  require( 'UTTERANCE_QUEUE/ActivationUtterance' );
  require( 'UTTERANCE_QUEUE/AlertableDef' );
  require( 'UTTERANCE_QUEUE/AriaHerald' );
  require( 'UTTERANCE_QUEUE/Utterance' );
  require( 'UTTERANCE_QUEUE/UtteranceQueue' );
  require( 'UTTERANCE_QUEUE/UtteranceQueueIO' );
  require( 'UTTERANCE_QUEUE/ValueChangeUtterance' );

  // note: we don't need any of the other parts, we just need to specify them as dependencies so they fill in the scenery namespace
  return utteranceQueueNamespace;
} );
