import serveStatic from "serve-static-bun";

console.log(
  "Starting local HTTP server... point your browser at http://localhost:8080!"
);

// static-HTML server
Bun.serve({ fetch: serveStatic("."), port: 8080 });

// streaming-HTML server
Bun.serve({
  port: 8000,
  fetch(_request) {
    return new Response(
      // cf. https://bun.sh/guides/http/stream-iterator
      async function* () {
        // prepare an unresolved promise whose resolver is in the same lexical scope
        let { promise, resolve } = Promise.withResolvers();

        const socket = new WebSocket( // cf. https://jakelazaroff.com/words/drinking-from-the-bluesky-firehose/
          "wss://jetstream1.us-east.bsky.network/subscribe?wantedCollections=app.bsky.feed.post"
        );

        // for each 'post' event from the Bluesky firehose:
        socket.addEventListener("message", (event) => {
          // parse its payload
          const data = JSON.parse(event.data);
          // is it from the creation of a new Bluesky post?
          if (data.kind === "commit" && data.commit.operation === "create") {
            // yes, resolve the promise with the (slightly cleaned-up) text of the post
            resolve(data.commit.record.text.replaceAll(/\n/g, " "));
          }
        });

        // first, stream the HTML prologue - taken from a local file
        // (by the magic of Bun, yield connects to the Response object of the ongoing
        // HTTP response, delivering a next chunk of bytes to be sent over the network)
        yield await Bun.file("./streaming.html").text();

        const escapeHtml = (unsafe) => {
          return unsafe
            .replaceAll("&", "&amp;")
            .replaceAll("<", "&lt;")
            .replaceAll(">", "&gt;")
            .replaceAll('"', "&quot;")
            .replaceAll("'", "&#039;");
        };

        // then, forever do this, continously incrementing a counter:
        for (let counter = 0; true; counter++) {
          // wait for the next Bluesky-post text
          const text = await promise;
          // yield a new HTML fragment that contains the text,
          // and will be slotted in one of slot 0..9
          // (in a circular fashion, using the counter)
          yield `<span slot="item-${counter % 10}">${escapeHtml(text)}</span>`;
          // again prepare an unresolved promise whose resolver is in the same lexical scope
          // (this gets us ready for the next loop iteration, since promises (unfortunately) can only
          // be resolved once)
          ({ promise, resolve } = Promise.withResolvers());
        }
      },
      { headers: { "Content-Type": "text/html" } }
    );
  },
});

const FORM_SUBMISSION_EPILOGUE = `
          </tbody>
      </table>
    </main>
    <footer>
            <div style="margin-bottom: 1rem">
                Made by <a href="https://github.com/cloudspeech">Markus Walther</a> |
                <a href="https://github.com/cloudspeech">Github</a> |
                <a href="https://www.linkedin.com/in/markuswalther/">LinkedIn</a>
            </div>
            <div>
                See the
                <a href="https://github.com/cloudspeech/html-apps-talk">talk</a>
            </div>
    </footer>
  </body>
</html>`;

Bun.serve({
  port: 8081,
  async fetch(request) {
    const formData = await request.formData();
    const htmlPrologue = await Bun.file("./formsubmission.html").text();
    const responseHTML = [htmlPrologue];
    for (const [key, value] of formData.entries()) {
      responseHTML.push(
        `<tr><td class="key">${key}</td><td class="value">${value}</td></tr>`
      );
    }
    responseHTML.push(FORM_SUBMISSION_EPILOGUE);
    return new Response(responseHTML.join("\n"), {
      headers: {
        "Content-Type": "text/html",
      },
      status: 200,
    });
  },
});
