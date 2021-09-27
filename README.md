utterance-queue
=======================================================

Alerting queue and library powered by aria-live

By PhET Interactive Simulations
https://phet.colorado.edu/

### Documentation

This is under active prototyping, so please expect any sort of API to change. Comments at this stage are very welcome.

#### Dependencies

[Grunt](http://gruntjs.com/) is used to build the source ("npm update -g grunt-cli", "npm update" and "grunt" at the top
level should build into build/). [Node.js](http://nodejs.org/) is required for this process.

Building source code requires the phetsims compiling repository: [chipper](http://github.com/phetsims/chipper/). Once
dependencies are downloaded, source is compiled by running `grunt`.

This library also depends on [lodash](https://lodash.com/). You can find the current checked in dependency for this
library in [sherpa](http://github.com/phetsims/sherpa/lib).

Currently, you can find the compiled library
at [utterance-queue.min.js](http://phetsims.github.io/utterance-queue/build/utterance-queue.min.js)
This is currently not versioned due to the accelerated development speed.

#### Hello World

(to be tested with a screen reader or your AT of choice)

```html

<script src="../sherpa/lib/lodash-4.17.4.js"></script>
<script src="../utterance-queue/build/utterance-queue.min.js"></script>
<script>
  const utteranceQueue = phet.utteranceQueue.UtteranceQueue.fromFactory();
  utteranceQueue.addToBack( 'hello world' );
</script>
```

`UtteranceQueue.fromFactory()` does a bit of setup work, and is a great place to start with the utterance-queue library.
If you want a bit more control you can setup like this:

```html

<html>
<body>
<button id="hello-button">Hello</button>
</body>
<script src="../sherpa/lib/lodash-4.17.4.js"></script>
<script src="../utterance-queue/build/utterance-queue.min.js"></script>
<script>
  const ariaLiveAnnouncer = new phet.utteranceQueue.AriaLiveAnnouncer();

  const utteranceQueue = new phet.utteranceQueue.UtteranceQueue( ariaLiveAnnouncer );

  const container = ariaLiveAnnouncer.ariaLiveContainer;

  // add the aria-live elements where ever is best
  document.body.appendChild( container );

  // step phet.axon.stepTimer (in seconds) each frame. This takes care of UtteranceQueue's timing
  let previousTime = 0;
  const step = elapsedTime => {
    const dt = elapsedTime - previousTime;
    previousTime = elapsedTime;
    phet.axon.stepTimer.emit( dt / 1000 ); // time takes seconds

    window.requestAnimationFrame( step );
  };
  window.requestAnimationFrame( step );

  utteranceQueue.addToBack( 'Press the button to hear "hello world".' );

  document.getElementById( 'hello-button' ).addEventListener( 'click', () => {

    // Now you have a fully operational UtteranceQueue.
    utteranceQueue.addToBack( 'hello world' );
  } )
</script>
</html>
```

The [PhET Development Overview](https://github.com/phetsims/phet-info/blob/master/doc/phet-development-overview.md) is
the most complete guide to PhET Simulation Development. This guide includes how to obtain simulation code and its
dependencies, notes about architecture & design, how to test and build the sims, as well as other important information.

### License

See the [license](LICENSE)