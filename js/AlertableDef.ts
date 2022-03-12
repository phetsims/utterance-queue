// Copyright 2019-2022, University of Colorado Boulder

/**
 * "definition" type for generalized alerts (anything that can be spoken by an
 * assistive device without requiring active focus). This includes anything
 * that can move through utteranceQueue.
 *
 * @author Jesse Greenberg
 */

import ResponsePacket from './ResponsePacket.js';
import Utterance from './Utterance.js';
import utteranceQueueNamespace from './utteranceQueueNamespace.js';

const AlertableDef = {

  /**
   * Returns whether the parameter is considered to be a alertable, for use in utteranceQueue. An item is alertable
   * if it passes isItemAlertable, OR is an array of those items. See isItemAlertable for supported types of
   * individual items. See utterance.js for documentation about why an array is beneficial.
   */
  isAlertableDef: function( alertable: any ): boolean {
    return alertable === null ||
           typeof alertable === 'string' ||
           typeof alertable === 'number' ||
           typeof alertable === 'function' ||
           alertable instanceof ResponsePacket ||
           alertable instanceof Utterance;
  }
};

utteranceQueueNamespace.register( 'AlertableDef', AlertableDef );

export default AlertableDef;
