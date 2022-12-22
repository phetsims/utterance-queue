// Copyright 2021-2022, University of Colorado Boulder

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

import { optionize3 } from '../../phet-core/js/optionize.js';
import utteranceQueueNamespace from './utteranceQueueNamespace.js';

// constants
const NAME_KEY = 'NAME';
const OBJECT_KEY = 'OBJECT';
const CONTEXT_KEY = 'CONTEXT';
const HINT_KEY = 'HINT';

export type ResponsePatternCollectionOptions = {
  nameObjectContextHint?: string;
  nameObjectContext?: string;
  nameObjectHint?: string;
  nameContextHint?: string;
  nameObject?: string;
  nameContext?: string;
  nameHint?: string;
  name?: string;
  objectContextHint?: string;
  objectContext?: string;
  objectHint?: string;
  contextHint?: string;
  object?: string;
  context?: string;
  hint?: string;
};

const DEFAULT_RESPONSE_PATTERNS = {
  nameObjectContextHint: '{{NAME}}, {{OBJECT}}, {{CONTEXT}} {{HINT}}',
  nameObjectContext: '{{NAME}}, {{OBJECT}}, {{CONTEXT}}',
  nameObjectHint: '{{NAME}}, {{OBJECT}}, {{HINT}}',
  nameContextHint: '{{NAME}}, {{CONTEXT}} {{HINT}}',
  nameObject: '{{NAME}}, {{OBJECT}}',
  nameContext: '{{NAME}}, {{CONTEXT}}',
  nameHint: '{{NAME}}, {{HINT}}',
  name: '{{NAME}}',
  objectContextHint: '{{OBJECT}}, {{CONTEXT}} {{HINT}}',
  objectContext: '{{OBJECT}}, {{CONTEXT}}',
  objectHint: '{{OBJECT}}, {{HINT}}',
  contextHint: '{{CONTEXT}} {{HINT}}',
  object: '{{OBJECT}}',
  context: '{{CONTEXT}}',
  hint: '{{HINT}}'
};

class ResponsePatternCollection {
  private readonly nameObjectContextHint: string;
  private readonly nameObjectContext: string;
  private readonly nameObjectHint: string;
  private readonly nameContextHint: string;
  private readonly nameObject: string;
  private readonly nameContext: string;
  private readonly nameHint: string;
  private readonly name: string;
  private readonly objectContextHint: string;
  private readonly objectContext: string;
  private readonly objectHint: string;
  private readonly contextHint: string;
  private readonly object: string;
  private readonly context: string;
  private readonly hint: string;

  public constructor( providedOptions?: ResponsePatternCollectionOptions ) {

    const options = optionize3<ResponsePatternCollectionOptions>()( {}, DEFAULT_RESPONSE_PATTERNS, providedOptions );

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


  public getResponsePattern( key: string ): string {
    // TODO: Not sure how to get rid of this index signature error. I was looking at assertion signatures in links below, see https://github.com/phetsims/tambo/issues/160
    // https://stackoverflow.com/questions/56568423/typescript-no-index-signature-with-a-parameter-of-type-string-was-found-on-ty
    // https://www.carlrippon.com/typescript-assertion-signatures/
    // @ts-expect-error - see above comment
    const patternString = this[ key ];
    assert && assert( patternString, `no pattern string found for key ${key}` );
    return patternString;
  }

  /**
   * Create a key to be used to get a string pattern for a Voicing response. Assumes keys
   * are like those listed in DEFAULT_RESPONSE_PATTERNS.
   */
  public static createPatternKey( includeName: boolean, includeObject: boolean, includeContext: boolean, includeHint: boolean ): string {
    let key = '';
    if ( includeName ) { key = key.concat( NAME_KEY.concat( '_' ) ); }
    if ( includeObject ) { key = key.concat( OBJECT_KEY.concat( '_' ) ); }
    if ( includeContext ) { key = key.concat( CONTEXT_KEY.concat( '_' ) ); }
    if ( includeHint ) { key = key.concat( HINT_KEY.concat( '_' ) ); }

    // convert to camel case and trim any underscores at the end of the string
    return _.camelCase( key );
  }

  // Default order and punctuation for Voicing responses.
  public static readonly DEFAULT_RESPONSE_PATTERNS = new ResponsePatternCollection();
}

utteranceQueueNamespace.register( 'ResponsePatternCollection', ResponsePatternCollection );
export default ResponsePatternCollection;
