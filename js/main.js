// Copyright 2019-2020, University of Colorado Boulder

/**
 * Module that includes all Utterance Queue dependencies, so that requiring this module will return an object
 * that consists of the entire exported 'utteranceQueue' namespace API.
 *
 *@author Michael Kauzmann (PhET Interactive Simulations)
 *@author Taylor Want (PhET Interactive Simulations)
 */

import './ActivationUtterance.js';
import './AlertableDef.js';
import './AriaHerald.js';
import './Utterance.js';
import './UtteranceQueue.js';
import utteranceQueueNamespace from './utteranceQueueNamespace.js';
import './ValueChangeUtterance.js';

// note: we don't need any of the other parts, we just need to specify them as dependencies so they fill in the scenery namespace
export default utteranceQueueNamespace;