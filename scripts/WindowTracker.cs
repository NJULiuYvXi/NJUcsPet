using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Runtime.InteropServices;
using System.Text;
using System.Threading;

internal static class WindowTracker
{
    private delegate bool EnumWindowsProc(IntPtr hWnd, IntPtr lParam);

    [StructLayout(LayoutKind.Sequential)]
    private struct RECT { public int Left, Top, Right, Bottom; }

    private struct Segment
    {
        public int Left, Right;
        public Segment(int left, int right) { Left = left; Right = right; }
    }

    [DllImport("user32.dll")]
    private static extern bool EnumWindows(EnumWindowsProc callback, IntPtr lParam);

    [DllImport("user32.dll")]
    private static extern bool IsWindow(IntPtr hWnd);

    [DllImport("user32.dll")]
    private static extern bool IsWindowVisible(IntPtr hWnd);

    [DllImport("user32.dll")]
    private static extern bool IsIconic(IntPtr hWnd);

    [DllImport("user32.dll")]
    private static extern bool GetWindowRect(IntPtr hWnd, out RECT rect);

    [DllImport("user32.dll")]
    private static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint processId);

    [DllImport("user32.dll", CharSet = CharSet.Unicode)]
    private static extern int GetClassName(IntPtr hWnd, StringBuilder text, int count);

    [DllImport("dwmapi.dll")]
    private static extern int DwmGetWindowAttribute(IntPtr hWnd, int attribute, out RECT rect, int size);

    [DllImport("dwmapi.dll")]
    private static extern int DwmGetWindowAttribute(IntPtr hWnd, int attribute, out int value, int size);

    private static IntPtr targetHandle;
    private static long ownHwnd;
    private static uint ownPid;
    private static RECT targetRect;
    private static List<Segment> visibleSegments = new List<Segment>();

    private static void Emit(string payload)
    {
        Console.Out.WriteLine(payload);
        Console.Out.Flush();
    }

    private static bool IsIgnoredClass(IntPtr handle)
    {
        StringBuilder value = new StringBuilder(256);
        GetClassName(handle, value, value.Capacity);
        string name = value.ToString();
        return name == "Progman" || name == "WorkerW" ||
               name == "Shell_TrayWnd" || name == "Shell_SecondaryTrayWnd";
    }

    private static bool TryGetUsableRect(IntPtr handle, out RECT rect)
    {
        rect = new RECT();
        if (handle.ToInt64() == ownHwnd || !IsWindowVisible(handle) || IsIconic(handle)) return false;

        uint processId;
        GetWindowThreadProcessId(handle, out processId);
        if (processId == ownPid || IsIgnoredClass(handle)) return false;

        int cloaked = 0;
        try { DwmGetWindowAttribute(handle, 14, out cloaked, sizeof(int)); } catch { cloaked = 0; }
        if (cloaked != 0) return false;

        bool gotFrame = false;
        try { gotFrame = DwmGetWindowAttribute(handle, 9, out rect, Marshal.SizeOf(typeof(RECT))) == 0; }
        catch { rect = new RECT(); }
        if (!gotFrame) GetWindowRect(handle, out rect);
        return rect.Right > rect.Left && rect.Bottom > rect.Top;
    }

    private static void Subtract(int left, int right)
    {
        List<Segment> remaining = new List<Segment>();
        foreach (Segment segment in visibleSegments)
        {
            if (right <= segment.Left || left >= segment.Right)
            {
                remaining.Add(segment);
                continue;
            }
            if (left > segment.Left)
                remaining.Add(new Segment(segment.Left, Math.Min(left, segment.Right)));
            if (right < segment.Right)
                remaining.Add(new Segment(Math.Max(right, segment.Left), segment.Right));
        }
        visibleSegments = remaining;
    }

    private static bool VisitWindowAboveTarget(IntPtr handle, IntPtr unused)
    {
        if (handle == targetHandle) return false;

        RECT blocker;
        if (!TryGetUsableRect(handle, out blocker)) return true;
        if (blocker.Top <= targetRect.Top && blocker.Bottom > targetRect.Top &&
            blocker.Right > targetRect.Left && blocker.Left < targetRect.Right)
        {
            Subtract(Math.Max(blocker.Left, targetRect.Left), Math.Min(blocker.Right, targetRect.Right));
            if (visibleSegments.Count == 0) return false;
        }
        return true;
    }

    private static void RefreshVisibleSegments(RECT rect)
    {
        targetRect = rect;
        visibleSegments = new List<Segment>();
        visibleSegments.Add(new Segment(rect.Left, rect.Right));
        EnumWindows(VisitWindowAboveTarget, IntPtr.Zero);
    }

    private static string SegmentsJson()
    {
        StringBuilder json = new StringBuilder("[");
        for (int index = 0; index < visibleSegments.Count; index++)
        {
            if (index > 0) json.Append(',');
            json.Append("{\"left\":").Append(visibleSegments[index].Left)
                .Append(",\"right\":").Append(visibleSegments[index].Right).Append('}');
        }
        return json.Append(']').ToString();
    }

    public static int Main(string[] args)
    {
        Console.OutputEncoding = new UTF8Encoding(false);
        long handleValue;
        if (args.Length < 1 || !long.TryParse(args[0], out handleValue)) return 2;
        int interval = 33;
        if (args.Length >= 2) int.TryParse(args[1], out interval);
        interval = Math.Max(16, interval);
        if (args.Length < 3 || !long.TryParse(args[2], out ownHwnd)) ownHwnd = 0;
        if (args.Length < 4 || !UInt32.TryParse(args[3], out ownPid)) ownPid = 0;

        targetHandle = new IntPtr(handleValue);
        string last = String.Empty;
        string lastGeometry = String.Empty;
        string cachedSegments = "[]";
        Stopwatch heartbeat = Stopwatch.StartNew();
        Stopwatch visibilityRefresh = Stopwatch.StartNew();

        while (IsWindow(targetHandle))
        {
            if (!IsWindowVisible(targetHandle) || IsIconic(targetHandle))
            {
                Emit("{\"available\":false}");
                return 0;
            }

            RECT rect;
            bool gotFrame = false;
            try
            {
                gotFrame = DwmGetWindowAttribute(targetHandle, 9, out rect, Marshal.SizeOf(typeof(RECT))) == 0;
            }
            catch
            {
                rect = new RECT();
            }
            if (!gotFrame) GetWindowRect(targetHandle, out rect);

            if (rect.Right > rect.Left && rect.Bottom > rect.Top)
            {
                string geometry = rect.Left + "," + rect.Top + "," + rect.Right + "," + rect.Bottom;
                if (geometry != lastGeometry || visibilityRefresh.ElapsedMilliseconds >= 100)
                {
                    RefreshVisibleSegments(rect);
                    cachedSegments = SegmentsJson();
                    visibilityRefresh.Restart();
                    lastGeometry = geometry;
                }

                string current = geometry + "|" + cachedSegments;
                if (current != last || heartbeat.ElapsedMilliseconds >= 500)
                {
                    Emit("{\"available\":true,\"left\":" + rect.Left +
                         ",\"top\":" + rect.Top +
                         ",\"right\":" + rect.Right +
                         ",\"bottom\":" + rect.Bottom +
                         ",\"segments\":" + cachedSegments + "}");
                    last = current;
                    heartbeat.Restart();
                }
            }
            Thread.Sleep(interval);
        }

        Emit("{\"available\":false}");
        return 0;
    }
}
