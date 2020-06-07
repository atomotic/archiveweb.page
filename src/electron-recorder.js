import { Recorder } from './recorder';

const DEBUG = false;


// ===========================================================================
class ElectronRecorder extends Recorder
{
  constructor(webContents, mainWC) {
    super(__WEBVIEW_PRELOAD_PATH__);
    this.mainWC = mainWC;
    
    this.injectScript = null;

    //console.log(mainWC);
    this.webContents = webContents;
    this.debugger = webContents.debugger;

    this.webContents.on("did-navigate", (event, url) => {
      this.didNavigateInitPage(url);
    });

    this.debugger.on("detach", (event, reason) => {
      console.log("detached", reason);
      this._stop();
    });

    this.debugger.on("message", (event, message, params) => {
      if (DEBUG) {
        console.log(" <= ", message);
      }
      this.processMessage(message, params, []);
    });

    this.webContents.on('page-favicon-updated', (event, favicons) => {
      this.favicons = favicons;
      for (const icon of favicons) {
        this.webContents.send("async-fetch", {url: icon});
      }
    });
  }

  async loadOpenUrl() {
    let expression;

    await this.started;

    console.log("loading " + this.openUrl);

    if (this.openUrl) {
      expression = `window.location.href = "${this.openUrl}";`;
    } else {
      return;
    }
    try {
      await this.send("Runtime.evaluate", {expression});
    } catch (e) {
      console.error(e);
    }
  }

  // Electron seems to not always pass through Page.frameNavigated events, so handle via 'did-navigate' instead
  didNavigateInitPage(url) {
    if (this.nextFrameId) {
      if (this.nextFrameId != this.frameId) {
        this.historyMap = {};
      }

      this.frameId = this.nextFrameId;
      this.nextFrameId = null;
    }

    this.pageInfo = {
      id: this.newPageId(),
      url,
      ts: 0,
      title: "",
      text: "",
      size: 0,
      finished: false,
      favIconUrl: "",
      mime: "",
    };

    this._pdfTextDone = null;
  }

  async processMessage(method, params, sessions) {
    if (await super.processMessage(method, params, sessions)) {
      return true;
    }

    switch (method) {
      case "Page.frameStartedLoading":
        this.nextFrameId = params.frameId;
        break;

      case "Page.frameStoppedLoading":
        this.nextFrameId = null;
        break;
    }
  }

  _doDetach() {
    this.debugger.detach();
  }

  _doAttach() {
    this.debugger.attach('1.3');
    this.started = this.start();
  };

  _doStop() {
    // send msg
  }

  _doUpdateFileSize(sizeMsg) {
    // send sizeMsg
  }

  getFavIcon() {
    return this.favicons && this.favicons.length ? this.favicons[0] : null;
  }

  _doAsyncFetch(request) {
    this.webContents.send("async-fetch", request);
  }

  _doPreparePDF(reqresp) {
    //const pdfblob = new Blob([reqresp.payload], {type: "application/pdf"});
    //this.pdfURL = URL.createObjectURL(pdfblob);
  }

  _doAddResource(data) {
    this.mainWC.send("add-resource", data, this.pageInfo);
  }

  _doAddPage(pageInfo) {
    this.mainWC.send("add-page", this.pageInfo);
  }

  _doSendCommand(method, params, promise) {
    if (DEBUG) {
      console.log(" => ", method, params);
    }
    try {
      const p = this.debugger.sendCommand(method, params);
      return promise ? promise : p;
    } catch (e) {
      console.warn(e);
    }
  }
}

export { ElectronRecorder };