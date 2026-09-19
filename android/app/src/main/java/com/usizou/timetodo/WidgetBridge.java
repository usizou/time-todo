package com.usizou.timetodo;

import android.appwidget.AppWidgetManager;
import android.content.ComponentName;
import android.content.Context;
import android.content.SharedPreferences;

import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

// Webアプリから受け取ったウィジェット用データを保存し、ウィジェットを更新する
@CapacitorPlugin(name = "WidgetBridge")
public class WidgetBridge extends Plugin {

    @PluginMethod
    public void update(PluginCall call) {
        String data = call.getString("data", "{}");
        Context ctx = getContext();
        SharedPreferences sp = ctx.getSharedPreferences("TimeTodoWidget", Context.MODE_PRIVATE);
        sp.edit().putString("data", data).apply();

        AppWidgetManager mgr = AppWidgetManager.getInstance(ctx);
        ComponentName cn = new ComponentName(ctx, TodoReminderWidget.class);
        int[] ids = mgr.getAppWidgetIds(cn);
        TodoReminderWidget.updateAll(ctx, mgr, ids);
        call.resolve();
    }
}
