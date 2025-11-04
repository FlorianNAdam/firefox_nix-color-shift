console.log("Hello from the Background script")

browser.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log("Background received message:", message);
  
  if (message.action === "getSettings") {
    browser.storage.local.get().then(settings => {
      console.log("Sending settings:", settings);
      sendResponse({ settings: settings });
    }).catch(error => {
      console.error("Error getting settings:", error);
      sendResponse({ settings: {} });
    });
    return true; 
  }
  
  if (message.action === "setSettings") {
    browser.storage.local.set(message.settings).then(() => {
      console.log("Settings saved");
      sendResponse({ success: true });
    }).catch(error => {
      console.error("Error saving settings:", error);
      sendResponse({ success: false });
    });
    return true; 
  }
  
  console.warn("Unknown action:", message.action);
  sendResponse({ error: "Unknown action" });
});
