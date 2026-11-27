package com.projectabyss.game;

import android.app.Activity;
import android.content.Intent;
import android.net.Uri;
import android.os.Bundle;
import android.view.View;
import android.view.WindowManager;
import android.webkit.JavascriptInterface;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.util.zip.ZipEntry;
import java.util.zip.ZipInputStream;

// PROJECT ABYSS (№110): игра открывается в WebView на весь экран, горизонтально.
// Все файлы (страница, картинки, звуки) лежат в приложении (assets/www) и отдаются по адресу
// https://abyss.local/… — как с сайта, поэтому работают загрузка звуков и моделей; интернет не нужен.
// Патчи: кнопка «Патч» в игре → выбор zip-файла → распаковка в files/www (поверх файлов приложения).
// Сначала ищем файл в патче, потом — в приложении. Патч накопительный: заменяет прежний целиком.
public class MainActivity extends Activity {
  private WebView web;
  private static final int PICK = 41;

  private File patchDir() { return new File(getFilesDir(), "www"); }

  @Override protected void onCreate(Bundle saved) {
    super.onCreate(saved);
    getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON | WindowManager.LayoutParams.FLAG_FULLSCREEN);
    web = new WebView(this);
    setContentView(web);
    WebSettings s = web.getSettings();
    s.setJavaScriptEnabled(true);
    s.setDomStorageEnabled(true);                 // сохранения игры (localStorage)
    s.setMediaPlaybackRequiresUserGesture(false); // звук
    s.setAllowFileAccess(false);
    web.setWebViewClient(new Client(this));
    web.addJavascriptInterface(new Bridge(this), "AbyssApp");
    if (saved != null) web.restoreState(saved); else web.loadUrl("https://abyss.local/index.html");
    hideBars();
  }

  // вложенные классы — статические, со ссылкой на окно: так их понимает сборщик Android
  private static class Client extends WebViewClient {
    private final MainActivity a;
    Client(MainActivity x) { a = x; }
    @Override public WebResourceResponse shouldInterceptRequest(WebView v, WebResourceRequest r) {
      Uri u = r.getUrl();
      if (!"abyss.local".equals(u.getHost())) return null;
      String p = u.getPath();
      if (p == null || p.equals("/")) p = "/index.html";
      String path = Uri.decode(p), m = mime(path);
      try {
        File pf = new File(a.patchDir(), path);
        InputStream in = pf.isFile() ? new FileInputStream(pf) : a.getAssets().open("www" + path);
        return new WebResourceResponse(m, (m.startsWith("text") || m.endsWith("json")) ? "utf-8" : null, in);
      } catch (IOException e) {
        return new WebResourceResponse("text/plain", "utf-8", 404, "Not Found", null, null);
      }
    }
  }

  // мост для игры: выбрать патч, сбросить патч
  public static class Bridge {
    private final MainActivity a;
    Bridge(MainActivity x) { a = x; }
    @JavascriptInterface public void pickPatch() { a.runOnUiThread(new Picker(a)); }
    @JavascriptInterface public void resetPatch() { deleteAll(a.patchDir()); a.ui(true, "сброшен", true); }
    @JavascriptInterface public boolean isApp() { return true; }
  }

  // именованные задачи (без безымянных классов — так надёжнее собирается)
  private static class Picker implements Runnable {
    private final MainActivity a;
    Picker(MainActivity x) { a = x; }
    @Override public void run() {
      Intent i = new Intent(Intent.ACTION_OPEN_DOCUMENT);
      i.addCategory(Intent.CATEGORY_OPENABLE);
      i.setType("*/*");
      try { a.startActivityForResult(i, PICK); } catch (Exception e) { a.report(false, "Не удалось открыть выбор файла"); }
    }
  }
  private static class Installer implements Runnable {
    private final MainActivity a; private final Uri uri;
    Installer(MainActivity x, Uri u) { a = x; uri = u; }
    @Override public void run() { a.install(uri); }
  }
  private static class Report implements Runnable {
    private final MainActivity a; private final boolean ok, reload; private final String msg;
    Report(MainActivity x, boolean o, String m, boolean r) { a = x; ok = o; msg = m; reload = r; }
    @Override public void run() { a.report(ok, msg); if (reload) a.web.reload(); }
  }

  @Override protected void onActivityResult(int req, int res, Intent data) {
    super.onActivityResult(req, res, data);
    if (req != PICK || res != RESULT_OK || data == null || data.getData() == null) return;
    new Thread(new Installer(this, data.getData())).start();
  }

  private void install(Uri uri) {
    File tmp = new File(getFilesDir(), "www_new"), dir = patchDir();
    deleteAll(tmp);
    boolean hasVersion = false;
    try {
      ZipInputStream z = new ZipInputStream(getContentResolver().openInputStream(uri));
      try {
        String base = tmp.getCanonicalPath() + File.separator;
        ZipEntry e; byte[] buf = new byte[65536];
        while ((e = z.getNextEntry()) != null) {
          String name = e.getName();
          if (name.startsWith("www/")) name = name.substring(4);
          File out = new File(tmp, name);
          if (!out.getCanonicalPath().startsWith(base)) continue;          // защита от путей «../»
          if (e.isDirectory()) { out.mkdirs(); continue; }
          out.getParentFile().mkdirs();
          FileOutputStream o = new FileOutputStream(out);
          try { int n; while ((n = z.read(buf)) > 0) o.write(buf, 0, n); } finally { o.close(); }
          if (name.equals("version.json")) hasVersion = true;
        }
      } finally { z.close(); }
    } catch (Exception ex) {
      deleteAll(tmp);
      ui(false, "Файл не читается как патч: " + ex.getMessage(), false);
      return;
    }
    if (!hasVersion || !new File(tmp, "index.html").isFile()) {
      deleteAll(tmp);
      ui(false, "Это не патч PROJECT ABYSS (нет version.json или index.html)", false);
      return;
    }
    deleteAll(dir);
    if (!tmp.renameTo(dir)) { ui(false, "Не удалось установить патч", false); return; }
    ui(true, "установлен", true);
  }

  private void ui(boolean ok, String msg, boolean reload) { runOnUiThread(new Report(this, ok, msg, reload)); }

  private void report(boolean ok, String msg) {
    String js = "window.AbyssPatchResult && window.AbyssPatchResult(" + ok + "," + org.json.JSONObject.quote(msg) + ")";
    web.evaluateJavascript(js, null);
  }

  private static void deleteAll(File f) {
    if (f == null || !f.exists()) return;
    File[] k = f.listFiles();
    if (k != null) for (File c : k) deleteAll(c);
    f.delete();
  }

  private static String mime(String p) {
    String q = p.toLowerCase();
    if (q.endsWith(".html")) return "text/html";
    if (q.endsWith(".js")) return "text/javascript";
    if (q.endsWith(".css")) return "text/css";
    if (q.endsWith(".json")) return "application/json";
    if (q.endsWith(".png")) return "image/png";
    if (q.endsWith(".jpg") || q.endsWith(".jpeg")) return "image/jpeg";
    if (q.endsWith(".webp")) return "image/webp";
    if (q.endsWith(".svg")) return "image/svg+xml";
    if (q.endsWith(".mp3")) return "audio/mpeg";
    if (q.endsWith(".ogg")) return "audio/ogg";
    if (q.endsWith(".wav")) return "audio/wav";
    return "application/octet-stream";
  }

  private void hideBars() {
    getWindow().getDecorView().setSystemUiVisibility(View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY | View.SYSTEM_UI_FLAG_FULLSCREEN
      | View.SYSTEM_UI_FLAG_HIDE_NAVIGATION | View.SYSTEM_UI_FLAG_LAYOUT_STABLE | View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN);
  }
  @Override public void onWindowFocusChanged(boolean f) { super.onWindowFocusChanged(f); if (f) hideBars(); }
  @Override protected void onSaveInstanceState(Bundle out) { super.onSaveInstanceState(out); web.saveState(out); }
  @Override protected void onPause() { super.onPause(); web.onPause(); }
  @Override protected void onResume() { super.onResume(); web.onResume(); hideBars(); }
  @Override public void onBackPressed() { if (web.canGoBack()) web.goBack(); else super.onBackPressed(); }
}
