// Copyright 2019, University of Colorado Boulder

/**
 * Module that includes all Utterance Queue dependencies, so that requiring this module will return an object
 * that consists of the entire exported 'utteranceQueue' namespace API.
 *
 *@author Michael Kauzmann (PhET Interactive Simulations)
 *@author Taylor Want (PhET Interactive Simulations)
 */

define( [
  'UTTERANCE_QUEUE/utteranceQueueNamespace', // first for a reason

  'UTTERANCE_QUEUE/ActivationUtterance',
  'UTTERANCE_QUEUE/AlertableDef',
  'UTTERANCE_QUEUE/AriaHerald',
  'UTTERANCE_QUEUE/Utterance',
  'UTTERANCE_QUEUE/UtteranceQueue',
  'UTTERANCE_QUEUE/UtteranceQueueIO',
  'UTTERANCE_QUEUE/ValueChangeUtterance'
], function( utteranceQueueNamespace ) {
  'use strict';

  // note: we don't need any of the other parts, we just need to specify them as dependencies so they fill in the scenery namespace
  return utteranceQueueNamespace;
} );
