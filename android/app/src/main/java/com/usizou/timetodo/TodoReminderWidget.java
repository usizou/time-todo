package com.usizou.timetodo;

import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.view.View;
import android.widget.RemoteViews;

import org.json.JSONArray;
import org.json.JSONObject;

// 案B：リマインダーとTo-Doを2セクションで表示する読み取り専用ウィジェット
public class TodoReminderWidget extends AppWidgetProvider {

    private static final int[] REM_ROWS = { R.id.w_rem1, R.id.w_rem2, R.id.w_rem3 };
    private static final int[] TODO_ROWS = { R.id.w_todo1, R.id.w_todo2, R.id.w_todo3 };

    @Override
    public void onUpdate(Context ctx, AppWidgetManager mgr, int[] ids) {
        updateAll(ctx, mgr, ids);
    }

    static void updateAll(Context ctx, AppWidgetManager mgr, int[] ids) {
        if (ids == null) return;
        SharedPreferences sp = ctx.getSharedPreferences("TimeTodoWidget", Context.MODE_PRIVATE);
        String data = sp.getString("data", "{}");
        for (int id : ids) {
            RemoteViews v = new RemoteViews(ctx.getPackageName(), R.layout.widget_todo_reminder);
            try {
                JSONObject o = new JSONObject(data);
                v.setTextViewText(R.id.w_date, o.optString("date", ""));
                JSONArray rems = o.optJSONArray("reminders");
                fillRows(v, REM_ROWS, rems);
                v.setViewVisibility(R.id.w_rem_empty, (rems == null || rems.length() == 0) ? View.VISIBLE : View.GONE);
                JSONArray todos = o.optJSONArray("todos");
                fillRows(v, TODO_ROWS, todos);
                v.setViewVisibility(R.id.w_todo_empty, (todos == null || todos.length() == 0) ? View.VISIBLE : View.GONE);
            } catch (Exception e) {
                // データが壊れていても落とさない
            }

            Intent open = ctx.getPackageManager().getLaunchIntentForPackage(ctx.getPackageName());
            if (open != null) {
                int flags = PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE;
                PendingIntent pi = PendingIntent.getActivity(ctx, 0, open, flags);
                v.setOnClickPendingIntent(R.id.w_root, pi);
            }
            mgr.updateAppWidget(id, v);
        }
    }

    private static void fillRows(RemoteViews v, int[] rowIds, JSONArray arr) {
        for (int i = 0; i < rowIds.length; i++) {
            if (arr != null && i < arr.length()) {
                JSONObject item = arr.optJSONObject(i);
                String time = item != null ? item.optString("time", "") : "";
                String title = item != null ? item.optString("title", "") : "";
                String line = time.isEmpty() ? title : (time + "  " + title);
                v.setTextViewText(rowIds[i], line);
                v.setViewVisibility(rowIds[i], View.VISIBLE);
            } else {
                v.setViewVisibility(rowIds[i], View.GONE);
            }
        }
    }
}
