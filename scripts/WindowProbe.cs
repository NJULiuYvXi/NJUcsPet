using System;
using System.Collections.Generic;
using System.Runtime.InteropServices;
using System.Text;

internal static class WindowProbe
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

    private static int x;
    private static int y;
    private static int maxDepth;
    private static int halfWidth;
    private static long ownHwnd;
    private static uint ownPid;
    private static int bestDistance = Int32.MaxValue;
    private static IntPtr bestHandle = IntPtr.Zero;
    private static RECT bestRect;
    private static Segment bestSegment;
    private static readonly List<RECT> WindowsAbove = new List<RECT>();

    private static void ResetQuery(int queryX, int queryY, int depth, int width, long excludedHwnd, uint excludedPid)
    {
        x = queryX;
        y = queryY;
        maxDepth = depth;
        halfWidth = Math.Max(0, width);
        ownHwnd = excludedHwnd;
        ownPid = excludedPid;
        bestDistance = Int32.MaxValue;
        bestHandle = IntPtr.Zero;
        bestRect = new RECT();
        bestSegment = new Segment();
        WindowsAbove.Clear();
    }

    private static string QueryJson(string requestId)
    {
        EnumWindows(VisitWindow, IntPtr.Zero);
        string prefix = requestId == null ? "{" : "{\"id\":" + requestId + ",";
        if (bestHandle == IntPtr.Zero) return prefix + "\"found\":false}";
        return prefix + "\"found\":true,\"hwnd\":\"" + bestHandle.ToInt64() +
            "\",\"left\":" + bestRect.Left +
            ",\"top\":" + bestRect.Top +
            ",\"right\":" + bestRect.Right +
            ",\"bottom\":" + bestRect.Bottom +
            ",\"visibleLeft\":" + bestSegment.Left +
            ",\"visibleRight\":" + bestSegment.Right + "}";
    }

    private static int RunServer()
    {
        Console.OutputEncoding = new UTF8Encoding(false);
        string line;
        while ((line = Console.ReadLine()) != null)
        {
            string[] fields = line.Split(',');
            int requestId, queryX, queryY, depth, width;
            long excludedHwnd;
            uint excludedPid;
            if (fields.Length != 7 ||
                !Int32.TryParse(fields[0], out requestId) ||
                !Int32.TryParse(fields[1], out queryX) ||
                !Int32.TryParse(fields[2], out queryY) ||
                !Int32.TryParse(fields[3], out depth) ||
                !Int32.TryParse(fields[4], out width) ||
                !Int64.TryParse(fields[5], out excludedHwnd) ||
                !UInt32.TryParse(fields[6], out excludedPid)) continue;
            ResetQuery(queryX, queryY, depth, width, excludedHwnd, excludedPid);
            Console.WriteLine(QueryJson(requestId.ToString()));
            Console.Out.Flush();
        }
        return 0;
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

    private static List<Segment> VisibleSegments(RECT target)
    {
        List<Segment> segments = new List<Segment>();
        segments.Add(new Segment(target.Left, target.Right));

        foreach (RECT blocker in WindowsAbove)
        {
            if (blocker.Top > target.Top || blocker.Bottom <= target.Top ||
                blocker.Right <= target.Left || blocker.Left >= target.Right) continue;

            List<Segment> remaining = new List<Segment>();
            foreach (Segment segment in segments)
            {
                if (blocker.Right <= segment.Left || blocker.Left >= segment.Right)
                {
                    remaining.Add(segment);
                    continue;
                }
                if (blocker.Left > segment.Left)
                    remaining.Add(new Segment(segment.Left, Math.Min(blocker.Left, segment.Right)));
                if (blocker.Right < segment.Right)
                    remaining.Add(new Segment(Math.Max(blocker.Right, segment.Left), segment.Right));
            }
            segments = remaining;
            if (segments.Count == 0) break;
        }
        return segments;
    }

    private static bool TryFindLandingSegment(List<Segment> segments, out Segment match)
    {
        foreach (Segment segment in segments)
        {
            if (x - halfWidth >= segment.Left && x + halfWidth <= segment.Right)
            {
                match = segment;
                return true;
            }
        }
        match = new Segment();
        return false;
    }

    private static bool VisitWindow(IntPtr handle, IntPtr unused)
    {
        RECT rect;
        if (!TryGetUsableRect(handle, out rect)) return true;

        int distance = rect.Top - y;
        Segment landingSegment;
        if (distance >= 0 && distance <= maxDepth && distance < bestDistance &&
            TryFindLandingSegment(VisibleSegments(rect), out landingSegment))
        {
            bestDistance = distance;
            bestHandle = handle;
            bestRect = rect;
            bestSegment = landingSegment;
        }

        // EnumWindows visits top-level windows from top to bottom. Every usable
        // rectangle recorded here is therefore above all later candidates.
        WindowsAbove.Add(rect);
        return true;
    }

    public static int Main(string[] args)
    {
        if (args.Length == 1 && args[0] == "--server") return RunServer();
        if (args.Length < 6 ||
            !Int32.TryParse(args[0], out x) ||
            !Int32.TryParse(args[1], out y) ||
            !Int32.TryParse(args[2], out maxDepth) ||
            !Int32.TryParse(args[3], out halfWidth) ||
            !Int64.TryParse(args[4], out ownHwnd) ||
            !UInt32.TryParse(args[5], out ownPid)) return 2;

        ResetQuery(x, y, maxDepth, halfWidth, ownHwnd, ownPid);
        Console.WriteLine(QueryJson(null));
        return 0;
    }
}
