"use strict";

(function () {
  let vscodeApi;
  const DEFAULT_FEATURES = Object.freeze({
    annotationEditing: false,
    currentView: false,
    documentProperties: false,
    download: false,
    externalLinks: false,
    forms: false,
    openFile: false,
    print: false,
  });

  function getVsCodeApi() {
    if (typeof acquireVsCodeApi !== "function") {
      return undefined;
    }
    if (!vscodeApi) {
      vscodeApi = acquireVsCodeApi();
    }
    return vscodeApi;
  }

  function postHostMessage(message) {
    const api = getVsCodeApi();
    api?.postMessage(message);
  }

  function loadConfig() {
    const elem = document.getElementById("pdf-preview-config");
    if (elem) {
      return JSON.parse(elem.getAttribute("data-config"));
    }
    throw new Error("Could not load configuration.");
  }

  function normalizeConfig(config) {
    return {
      ...config,
      features: {
        ...DEFAULT_FEATURES,
        ...(config.features || {}),
      },
    };
  }

  function cursorTools(name) {
    return name === "hand" ? 1 : 0;
  }

  function scrollMode(name) {
    switch (name) {
      case "vertical":
        return 0;
      case "horizontal":
        return 1;
      case "wrapped":
        return 2;
      default:
        return 0;
    }
  }

  function spreadMode(name) {
    switch (name) {
      case "none":
        return 0;
      case "odd":
        return 1;
      case "even":
        return 2;
      default:
        return 0;
    }
  }

  function createLoadOptions(config) {
    return {
      url: config.path,
      useWorkerFetch: false,
      annotationMode: config.features.forms ? 2 : 1,
      cMapUrl: config.cMapUrl,
      cMapPacked: true,
      enableXfa: config.features.forms,
      iccUrl: config.iccUrl,
      standardFontDataUrl: config.standardFontDataUrl,
      wasmUrl: config.wasmUrl,
      isEvalSupported: false,
    };
  }

  function setElementHidden(element, hidden) {
    if (!element) {
      return;
    }
    element.hidden = hidden;
    element.setAttribute("aria-hidden", hidden ? "true" : "false");
    if ("disabled" in element) {
      element.disabled = hidden;
    }
  }

  function hideElementById(id) {
    setElementHidden(document.getElementById(id), true);
  }

  function hideToolbarGroupFor(controlId) {
    const control = document.getElementById(controlId);
    const group = control?.closest(".toolbarHorizontalGroup, .visibleMediumView");
    setElementHidden(group, true);
    const separator = group?.nextElementSibling;
    if (
      separator &&
      separator.classList.contains("verticalToolbarSeparator")
    ) {
      setElementHidden(separator, true);
    }
  }

  function applyFeatureVisibility(config) {
    if (!config.features.annotationEditing) {
      hideElementById("editorModeButtons");
      hideElementById("editorModeSeparator");
    }
    if (!config.features.openFile) {
      hideElementById("secondaryOpenFile");
    }
    if (!config.features.currentView) {
      hideElementById("viewBookmark");
      hideElementById("viewBookmarkSeparator");
    }
    if (!config.features.documentProperties) {
      hideElementById("documentProperties");
    }
    if (!config.features.print) {
      hideElementById("printButton");
      hideElementById("secondaryPrint");
    }
    if (!config.features.download) {
      hideElementById("downloadButton");
      hideElementById("secondaryDownload");
    }
    if (!config.features.print && !config.features.download) {
      hideToolbarGroupFor("printButton");
    }
  }

  function isBlockedShortcut(event, config) {
    const hasPrimaryModifier = event.ctrlKey || event.metaKey;
    if (!hasPrimaryModifier || event.altKey) {
      return false;
    }
    switch (String(event.key || "").toLowerCase()) {
      case "o":
        return !config.features.openFile;
      case "p":
        return !config.features.print;
      case "s":
        return !config.features.download;
      default:
        return false;
    }
  }

  function isExternalNavigationHref(href) {
    if (!href || href.startsWith("#")) {
      return false;
    }
    try {
      return new URL(href, window.location.href).origin !== window.location.origin;
    } catch {
      return /^[a-zA-Z][a-zA-Z\d+.-]*:/.test(href);
    }
  }

  function blockDisallowedActions(app, config) {
    const blockedEvents = new Set();
    if (!config.features.openFile) {
      blockedEvents.add("openfile");
    }
    if (!config.features.download) {
      blockedEvents.add("download");
    }
    if (!config.features.print) {
      blockedEvents.add("print");
      window.print = function () {};
    }
    if (!config.features.annotationEditing) {
      blockedEvents.add("switchannotationeditormode");
    }

    if (blockedEvents.size > 0) {
      const originalDispatch = app.eventBus.dispatch.bind(app.eventBus);
      app.eventBus.dispatch = function (eventName, data) {
        if (blockedEvents.has(eventName)) {
          return;
        }
        return originalDispatch(eventName, data);
      };
    }

    window.addEventListener(
      "keydown",
      function (event) {
        if (!isBlockedShortcut(event, config)) {
          return;
        }
        event.preventDefault();
        event.stopImmediatePropagation();
      },
      true
    );

    window.addEventListener(
      "click",
      function (event) {
        const target = event.target;
        if (!(target instanceof Element)) {
          return;
        }

        const anchor = target.closest("a[href]");
        if (anchor instanceof HTMLAnchorElement) {
          if (!config.features.currentView && anchor.id === "viewBookmark") {
            event.preventDefault();
            event.stopImmediatePropagation();
            return;
          }
          if (
            !config.features.externalLinks &&
            isExternalNavigationHref(anchor.getAttribute("href") || "")
          ) {
            event.preventDefault();
            event.stopImmediatePropagation();
            return;
          }
        }

        const control = target.closest(
          "#secondaryOpenFile, #printButton, #secondaryPrint, #downloadButton, #secondaryDownload, #documentProperties"
        );
        if (!control) {
          return;
        }

        const disabled =
          (!config.features.openFile && control.id === "secondaryOpenFile") ||
          (!config.features.print &&
            (control.id === "printButton" || control.id === "secondaryPrint")) ||
          (!config.features.download &&
            (control.id === "downloadButton" ||
              control.id === "secondaryDownload")) ||
          (!config.features.documentProperties &&
            control.id === "documentProperties");
        if (!disabled) {
          return;
        }

        event.preventDefault();
        event.stopImmediatePropagation();
      },
      true
    );
  }

  function applyViewerState(app, state, defaultCursor) {
    app.pdfCursorTools.switchTool(cursorTools(defaultCursor));
    app.pdfViewer.currentScaleValue = state.scale;
    app.pdfViewer.scrollMode = state.scrollMode;
    app.pdfViewer.spreadMode = state.spreadMode;
    app.page = state.page;

    if (!app.viewsManager) {
      return;
    }

    if (state.sidebarOpen) {
      app.viewsManager.open();
    } else {
      app.viewsManager.close();
    }
  }

  function captureViewerState(app, config) {
    return {
      page: app.page,
      scale: app.pdfViewer.currentScaleValue || config.defaults.scale,
      scrollMode: app.pdfViewer.scrollMode,
      spreadMode: app.pdfViewer.spreadMode,
      sidebarOpen: app.viewsManager ? app.viewsManager.isOpen : false,
    };
  }

  function createInitialViewerState(config) {
    return {
      page: 1,
      scale: config.defaults.scale,
      scrollMode: scrollMode(config.defaults.scrollMode),
      spreadMode: spreadMode(config.defaults.spreadMode),
      sidebarOpen: config.defaults.sidebar,
    };
  }

  function onceDocumentLoaded(app, action) {
    let handler;
    const promise = new Promise((resolve, reject) => {
      handler = () => {
        app.eventBus.off("documentloaded", handler);

        try {
          action();
          resolve();
        } catch (error) {
          reject(error);
        }
      };

      app.eventBus.on("documentloaded", handler);
    });

    return {
      promise,
      dispose() {
        if (handler) {
          app.eventBus.off("documentloaded", handler);
          handler = undefined;
        }
      },
    };
  }

  async function openDocument(app, config, state) {
    const onLoaded = onceDocumentLoaded(app, function () {
      applyViewerState(app, state, config.defaults.cursor);
    });

    try {
      await app.open(createLoadOptions(config));
      await onLoaded.promise;
    } catch (error) {
      onLoaded.dispose();
      throw error;
    }
  }

  function applyViewerOptions(options, config) {
    options.set("annotationEditorMode", config.features.annotationEditing ? 0 : -1);
    options.set("annotationMode", config.features.forms ? 2 : 1);
    options.set("cMapUrl", config.cMapUrl);
    options.set("cMapPacked", true);
    options.set("iccUrl", config.iccUrl);
    options.set("imageResourcesPath", config.imageResourcesPath);
    options.set("sandboxBundleSrc", config.sandboxBundleSrc);
    options.set("standardFontDataUrl", config.standardFontDataUrl);
    options.set("defaultZoomValue", config.defaults.scale);
    options.set("enableAutoLinking", config.features.externalLinks);
    options.set("enableComment", config.features.annotationEditing);
    options.set("enableSignatureEditor", config.features.annotationEditing);
    options.set("enableHighlightFloatingButton", config.features.annotationEditing);
    options.set("wasmUrl", config.wasmUrl);
    options.set("workerSrc", config.workerSrc);
    options.set("cursorToolOnLoad", cursorTools(config.defaults.cursor));
    options.set("scrollModeOnLoad", scrollMode(config.defaults.scrollMode));
    options.set("spreadModeOnLoad", spreadMode(config.defaults.spreadMode));
    options.set("sidebarViewOnLoad", config.defaults.sidebar ? 1 : 0);
    options.set("disablePreferences", true);
    options.set("enableScripting", false);
    options.set("enableXfa", config.features.forms);
    options.set("isEvalSupported", false);
  }

  function isReloadMessage(value) {
    return Boolean(value && typeof value === "object" && value.type === "reload");
  }

  const config = normalizeConfig(loadConfig());

  document.addEventListener(
    "webviewerloaded",
    function () {
      applyViewerOptions(window.PDFViewerApplicationOptions, config);
    },
    { once: true }
  );

  window.addEventListener(
    "load",
    async function () {
      const app = window.PDFViewerApplication;

      await app.initializedPromise;
      applyFeatureVisibility(config);
      blockDisallowedActions(app, config);
      app.eventBus.on("documentloaded", function () {
        postHostMessage({
          type: "document-loaded",
          pagesCount: app.pagesCount,
        });
      });
      app.eventBus.on("documenterror", function (event) {
        postHostMessage({
          type: "document-error",
          message: event?.reason || event?.message || "Unknown PDF.js error",
        });
      });
      await openDocument(app, config, createInitialViewerState(config));

      if (app.pdfLinkService) {
        app.pdfLinkService.externalLinkEnabled = config.features.externalLinks;
      }

      let pendingOpen = Promise.resolve();

      window.addEventListener("message", function (event) {
        if (!isReloadMessage(event.data)) {
          return;
        }

        pendingOpen = pendingOpen
          .catch(function () {
            return undefined;
          })
          .then(async function () {
            const state = captureViewerState(app, config);
            if (app.pdfLinkService) {
              app.pdfLinkService.externalLinkEnabled = config.features.externalLinks;
            }
            await openDocument(app, config, state);
          });
      });
    },
    { once: true }
  );

  window.onerror = function () {
    postHostMessage({
      type: "document-error",
      message: "An unexpected error occurred while loading the PDF.",
    });
    const msg = document.createElement("body");
    msg.innerText =
      "An error occurred while loading the file. Please open it again.";
    document.body = msg;
  };
})();
