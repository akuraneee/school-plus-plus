package io.github.akuraneee.schoolsplusplus;

import android.app.Activity;
import android.content.Intent;
import android.content.SharedPreferences;
import android.graphics.Insets;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.view.WindowInsets;
import android.webkit.CookieManager;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.FrameLayout;

import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;

/**
 * Окно с schools.by: на страницы сайта встраивается Schools++ (тот же скрипт, что для iPhone)
 * и тёмная тема (тот же CSS, что в десктопном приложении).
 */
public class MainActivity extends Activity {
    private static final String START_URL = "https://schools.by/";
    private static final int BG = 0xFF15181E;

    private WebView web;
    private SharedPreferences prefs;
    private String userscript;
    private String darkThemeJs;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        prefs = getSharedPreferences("spp", MODE_PRIVATE);
        userscript = readAsset("schools-plus-plus.user.js");
        darkThemeJs = "(function(){if(document.getElementById('spp-dark'))return;"
                + "var s=document.createElement('style');s.id='spp-dark';s.textContent="
                + JSONObject.quote(readAsset("site-dark.css"))
                + ";(document.head||document.documentElement).appendChild(s);})();";

        FrameLayout root = new FrameLayout(this);
        root.setBackgroundColor(BG);
        web = new WebView(this);
        web.setBackgroundColor(BG);
        root.addView(web, new FrameLayout.LayoutParams(
                FrameLayout.LayoutParams.MATCH_PARENT, FrameLayout.LayoutParams.MATCH_PARENT));
        setContentView(root);

        // Android 15 рисует приложение под статус-баром и панелью навигации — отодвигаем содержимое.
        root.setOnApplyWindowInsetsListener((v, insets) -> {
            if (Build.VERSION.SDK_INT >= 30) {
                Insets i = insets.getInsets(WindowInsets.Type.systemBars() | WindowInsets.Type.ime());
                v.setPadding(i.left, i.top, i.right, i.bottom);
            } else {
                v.setPadding(insets.getSystemWindowInsetLeft(), insets.getSystemWindowInsetTop(),
                        insets.getSystemWindowInsetRight(), insets.getSystemWindowInsetBottom());
            }
            return insets;
        });

        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true); // здесь Schools++ хранит загруженный дневник
        s.setAllowFileAccess(false);
        s.setAllowContentAccess(false);
        s.setSupportMultipleWindows(false);
        s.setBuiltInZoomControls(true);
        s.setDisplayZoomControls(false);

        CookieManager cookies = CookieManager.getInstance();
        cookies.setAcceptCookie(true);
        cookies.setAcceptThirdPartyCookies(web, false);

        web.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                Uri uri = request.getUrl();
                if ("https".equals(uri.getScheme())) return false;
                // tel:, mailto:, http: и прочее — в соответствующих приложениях
                try {
                    startActivity(new Intent(Intent.ACTION_VIEW, uri));
                } catch (Exception ignored) {
                    // нет приложения для такой ссылки
                }
                return true;
            }

            @Override
            public void onPageCommitVisible(WebView view, String url) {
                // Тёмная тема как можно раньше, чтобы не мигало белым.
                if (isSchools(url)) view.evaluateJavascript(darkThemeJs, null);
            }

            @Override
            public void onPageFinished(WebView view, String url) {
                if (!isSchools(url)) return;
                view.evaluateJavascript(darkThemeJs, null);
                view.evaluateJavascript(userscript, null); // повторный запуск безопасен: кнопка не дублируется
                if (!url.contains("/login")) prefs.edit().putString("lastUrl", url).apply();
            }
        });

        if (savedInstanceState != null) {
            web.restoreState(savedInstanceState);
        } else {
            String last = prefs.getString("lastUrl", null);
            web.loadUrl(last != null && isSchools(last) ? last : START_URL);
        }
    }

    private static boolean isSchools(String url) {
        if (url == null) return false;
        Uri u = Uri.parse(url);
        String host = u.getHost();
        return "https".equals(u.getScheme()) && host != null
                && (host.equals("schools.by") || host.endsWith(".schools.by"));
    }

    private String readAsset(String name) {
        try (InputStream in = getAssets().open(name)) {
            ByteArrayOutputStream out = new ByteArrayOutputStream();
            byte[] buf = new byte[16384];
            int n;
            while ((n = in.read(buf)) > 0) out.write(buf, 0, n);
            return out.toString(StandardCharsets.UTF_8.name());
        } catch (IOException e) {
            throw new IllegalStateException("Нет файла " + name + " в сборке", e);
        }
    }

    @Override
    @SuppressWarnings("deprecation")
    public void onBackPressed() {
        if (web.canGoBack()) web.goBack();
        else super.onBackPressed();
    }

    @Override
    protected void onSaveInstanceState(Bundle outState) {
        super.onSaveInstanceState(outState);
        web.saveState(outState);
    }

    @Override
    protected void onResume() {
        super.onResume();
        web.onResume();
    }

    @Override
    protected void onPause() {
        CookieManager.getInstance().flush(); // сохранить вход
        web.onPause();
        super.onPause();
    }

    @Override
    protected void onDestroy() {
        web.destroy();
        super.onDestroy();
    }
}
