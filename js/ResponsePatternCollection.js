// Copyright 2021, University of Colorado Boulder

/**
 * A collection of string patterns that are used with responseCollector.collectResponses(). Responses for Voicing are
 * categorized into one of "Name", "Object", "Context", or "Hint" responses. A node that implements voicing may
 * have any number of these responses and each of these responses can be enabled/disabled by user preferences
 * through the Properties of responseCollector. So we need string patterns that include each combination of response.
 *
 * Furthermore, you may want to control the order, punctuation, or other content in these patterns, so the default
 * cannot be used. ResponsePatternCollection will have a collections of patterns that may be generally useful. But if
 * you need a collection that is not provided here, you can construct additional instances to create an object based
 * on one of the pre-made collections in this file. If you need something totally different, create your own from
 * scratch (passing in all options to the constructor).
 *
 * @author Jesse Greenberg (PhET Interactive Simulations)
 */

import merge from '../../phet-core/js/merge.js';
import utteranceQueueNamespace from './utteranceQueueNamespace.js';

// constants
const NAME_KEY = 'NAME';
const OBJECT_KEY = 'OBJECT';
const CONTEXT_KEY = 'CONTEXT';
const HINT_KEY = 'HINT';

const DEFAULT_RESPONSE_PATTERNS = {
  nameObjectContextHint: '{{NAME}}, {{OBJECT}}, {{CONTEXT}} {{HINT}}',
  nameObjectContext: '{{NAME}}, {{OBJECT}}, {{CONTEXT}}',
  nameObjectHint: '{{NAME}}, {{OBJECT}}, {{HINT}}',
  nameContextHint: '{{NAME}}, {{CONTEXT}} {{HINT}}',
  nameObject: '{{NAME}}, {{OBJECT}}, ',
  nameContext: '{{NAME}}, {{CONTEXT}}',
  nameHint: '{{NAME}}, {{HINT}}',
  name: '{{NAME}}',
  objectContextHint: '{{OBJECT}}, {{CONTEXT}} {{HINT}}',
  objectContext: '{{OBJECT}}, {{CONTEXT}}',
  objectHint: '{{OBJECT}}, {{HINT}}',
  contextHint: '{{CONTEXT}} {{HINT}}',
  object: '{{OBJECT}} ',
  context: '{{CONTEXT}}',
  hint: '{{HINT}}'
};

class ResponsePatternCollection {

  /**
   * @param {Object} [options]
   */
  constructor( options ) {
    options = merge( {}, DEFAULT_RESPONSE_PATTERNS, options );

    // @public (read-only)
    this.nameObjectContextHint = options.nameObjectContextHint;
    this.nameObjectContext = options.nameObjectContext;
    this.nameObjectHint = options.nameObjectHint;
    this.nameContextHint = options.nameContextHint;
    this.nameObject = options.nameObject;
    this.nameContext = options.nameContext;
    this.nameHint = options.nameHint;
    this.name = options.name;
    this.objectContextHint = options.objectContextHint;
    this.objectContext = options.objectContext;
    this.objectHint = options.objectHint;
    this.contextHint = options.contextHint;
    this.object = options.object;
    this.context = options.context;
    this.hint = options.hint;
  }

  /**
   * Create a key to be used to get a string pattern for a Voicing response. Assumes keys
   * are like those listed in DEFAULT_RESPONSE_PATTERNS.
   * @public
   *
   * @param {boolean} includeName
   * @param {boolean} includeObject
   * @param {boolean} includeContext
   * @param {boolean} includeHint
   * @returns {string} - string key, could be empty
   */
  static createPatternKey( includeName, includeObject, includeContext, includeHint ) {
    let key = '';
    if ( includeName ) { key = key.concat( NAME_KEY.concat( '_' ) ); }
    if ( includeObject ) { key = key.concat( OBJECT_KEY.concat( '_' ) ); }
    if ( includeContext ) { key = key.concat( CONTEXT_KEY.concat( '_' ) ); }
    if ( includeHint ) { key = key.concat( HINT_KEY.concat( '_' ) ); }

    // convert to camel case and trim any underscores at the end of the string
    return _.camelCase( key );
  }
}

// @public - Default order and punctuation for Voicing responses.
ResponsePatternCollection.DEFAULT_RESPONSE_PATTERNS = new ResponsePatternCollection();

utteranceQueueNamespace.register( 'ResponsePatternCollection', ResponsePatternCollection );
export default ResponsePatternCollection;
