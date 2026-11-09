import 'dart:math' as math;
import 'package:flutter/material.dart';

const recallInk = Color(0xff123c33);
const recallMint = Color(0xffe7f3ec);
const recallCream = Color(0xfffafbf8);
const recallGold = Color(0xffe3b855);

class RecallSurface extends StatelessWidget {
  final Widget child;
  final Color color;
  final Color? border;
  final EdgeInsets padding;
  const RecallSurface({
    super.key,
    required this.child,
    this.color = Colors.white,
    this.border,
    this.padding = const EdgeInsets.all(18),
  });
  @override
  Widget build(BuildContext context) => Container(
    padding: padding,
    decoration: BoxDecoration(
      color: color,
      borderRadius: BorderRadius.circular(25),
      border: Border.all(color: border ?? const Color(0xffdfe8e2)),
      boxShadow: const [
        BoxShadow(
          color: Color(0x060d3928),
          blurRadius: 16,
          offset: Offset(0, 5),
        ),
      ],
    ),
    child: child,
  );
}

class RecallBrand extends StatelessWidget {
  final VoidCallback? onNotifications, onSettings;
  final bool centered;
  const RecallBrand({
    super.key,
    this.onNotifications,
    this.onSettings,
    this.centered = false,
  });
  @override
  Widget build(BuildContext context) => Row(
    mainAxisAlignment: centered
        ? MainAxisAlignment.center
        : MainAxisAlignment.start,
    children: [
      Image.asset('assets/recall-icon.png', width: 42, height: 42),
      const SizedBox(width: 10),
      const Text(
        'Recall',
        style: TextStyle(
          fontSize: 27,
          fontWeight: FontWeight.w800,
          color: recallInk,
          letterSpacing: -1,
        ),
      ),
      if (onNotifications != null || onSettings != null) const Spacer(),
      if (onNotifications != null)
        IconButton(
          tooltip: 'Phone reminders',
          onPressed: onNotifications,
          icon: const Icon(
            Icons.notifications_none_rounded,
            color: recallInk,
            size: 27,
          ),
        ),
      if (onSettings != null)
        IconButton(
          tooltip: 'Settings',
          onPressed: onSettings,
          icon: const Icon(Icons.settings_outlined, color: recallInk, size: 26),
        ),
    ],
  );
}

class RecallPrimaryButton extends StatelessWidget {
  final String label;
  final VoidCallback? onPressed;
  final bool busy;
  const RecallPrimaryButton({
    super.key,
    required this.label,
    required this.onPressed,
    this.busy = false,
  });
  @override
  Widget build(BuildContext context) => DecoratedBox(
    decoration: BoxDecoration(
      borderRadius: BorderRadius.circular(20),
      gradient: LinearGradient(
        colors: onPressed == null
            ? [const Color(0xff91a89c), const Color(0xff91a89c)]
            : [const Color(0xff133e35), const Color(0xff236355)],
      ),
    ),
    child: ElevatedButton(
      style: ElevatedButton.styleFrom(
        backgroundColor: Colors.transparent,
        shadowColor: Colors.transparent,
        disabledBackgroundColor: Colors.transparent,
        minimumSize: const Size.fromHeight(54),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(20)),
      ),
      onPressed: onPressed,
      child: busy
          ? const SizedBox(
              width: 22,
              height: 22,
              child: CircularProgressIndicator(
                strokeWidth: 2,
                color: Colors.white,
              ),
            )
          : FittedBox(
              fit: BoxFit.scaleDown,
              child: Text(
                label,
                style: const TextStyle(
                  fontSize: 18,
                  fontWeight: FontWeight.w700,
                  color: Colors.white,
                ),
              ),
            ),
    ),
  );
}

class RecallDetailRow extends StatelessWidget {
  final IconData icon;
  final String label, value;
  final String? subtitle;
  final VoidCallback? onTap;
  const RecallDetailRow({
    super.key,
    required this.icon,
    required this.label,
    required this.value,
    this.subtitle,
    this.onTap,
  });
  @override
  Widget build(BuildContext context) => Padding(
    padding: const EdgeInsets.only(bottom: 10),
    child: Material(
      color: Colors.white,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(21),
        side: const BorderSide(color: Color(0xffdfe8e2)),
      ),
      child: InkWell(
        borderRadius: BorderRadius.circular(21),
        onTap: onTap,
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 14),
          child: Row(
            children: [
              Container(
                width: 44,
                height: 44,
                decoration: BoxDecoration(
                  color: recallMint,
                  borderRadius: BorderRadius.circular(14),
                ),
                child: Icon(icon, color: recallInk, size: 24),
              ),
              const SizedBox(width: 12),
              Expanded(
                flex: 4,
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      label,
                      style: const TextStyle(
                        fontSize: 16,
                        fontWeight: FontWeight.w700,
                        color: recallInk,
                      ),
                    ),
                    if (subtitle != null)
                      Text(
                        subtitle!,
                        style: const TextStyle(
                          fontSize: 12,
                          color: Color(0xff728b80),
                        ),
                      ),
                  ],
                ),
              ),
              const SizedBox(width: 8),
              Expanded(
                flex: 5,
                child: Text(
                  value,
                  textAlign: TextAlign.right,
                  style: const TextStyle(
                    fontSize: 15,
                    height: 1.3,
                    color: recallInk,
                  ),
                ),
              ),
              if (onTap != null) ...[
                const SizedBox(width: 6),
                const Icon(Icons.chevron_right, color: recallInk, size: 20),
              ],
            ],
          ),
        ),
      ),
    ),
  );
}

class RecallVoiceOrb extends StatefulWidget {
  final bool listening;
  final double level;
  final VoidCallback? onTap;
  const RecallVoiceOrb({
    super.key,
    required this.listening,
    required this.level,
    this.onTap,
  });
  @override
  State<RecallVoiceOrb> createState() => _RecallVoiceOrbState();
}

class _RecallVoiceOrbState extends State<RecallVoiceOrb>
    with SingleTickerProviderStateMixin {
  late final AnimationController pulse = AnimationController(
    vsync: this,
    duration: const Duration(milliseconds: 1500),
  );
  @override
  void initState() {
    super.initState();
    if (widget.listening) pulse.repeat(reverse: true);
  }

  @override
  void didUpdateWidget(covariant RecallVoiceOrb old) {
    super.didUpdateWidget(old);
    if (widget.listening && !old.listening) pulse.repeat(reverse: true);
    if (!widget.listening && old.listening) {
      pulse.stop();
      pulse.value = 0;
    }
  }

  @override
  void dispose() {
    pulse.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => AnimatedBuilder(
    animation: pulse,
    builder: (context, _) => LayoutBuilder(
      builder: (context, c) {
        final size = math.min(c.maxWidth, c.maxHeight);
        return Stack(
          alignment: Alignment.center,
          children: [
            for (final scale in [1.0, 0.8, 0.61])
              AnimatedContainer(
                duration: const Duration(milliseconds: 120),
                width: size * scale,
                height: size * scale,
                decoration: BoxDecoration(
                  shape: BoxShape.circle,
                  color: widget.listening
                      ? Color.lerp(
                          const Color(0xffdff8e7),
                          const Color(0xff88dba8),
                          (widget.level * 0.6 + pulse.value * 0.12).clamp(
                            0.0,
                            1.0,
                          ),
                        )!.withValues(alpha: 0.55)
                      : recallMint.withValues(alpha: 0.7),
                ),
              ),
            Semantics(
              button: true,
              label: widget.listening ? 'Stop recording' : 'Start recording',
              child: Material(
                shape: const CircleBorder(),
                color: Colors.transparent,
                child: InkWell(
                  customBorder: const CircleBorder(),
                  onTap: widget.onTap,
                  child: Container(
                    width: size * 0.48,
                    height: size * 0.48,
                    decoration: BoxDecoration(
                      shape: BoxShape.circle,
                      gradient: const RadialGradient(
                        colors: [Color(0xff22674e), recallInk],
                      ),
                      border: Border.all(
                        color: widget.listening
                            ? const Color(0xffd6ffdd)
                            : const Color(0xffffe4a0),
                        width: widget.listening ? 2.5 : 5,
                      ),
                      boxShadow: [
                        BoxShadow(
                          color: widget.listening
                              ? const Color(
                                  0xff64cf8d,
                                ).withValues(alpha: 0.25 + widget.level * 0.25)
                              : const Color(0x15325643),
                          blurRadius: widget.listening ? 24 : 12,
                        ),
                      ],
                    ),
                    child: Icon(
                      widget.listening
                          ? Icons.stop_rounded
                          : Icons.mic_none_rounded,
                      color: const Color(0xfff7fcf5),
                      size: size * 0.23,
                    ),
                  ),
                ),
              ),
            ),
          ],
        );
      },
    ),
  );
}

class RecallNavigation extends StatelessWidget {
  final int selected, count;
  final ValueChanged<int> onSelected;
  const RecallNavigation({
    super.key,
    required this.selected,
    required this.count,
    required this.onSelected,
  });
  @override
  Widget build(BuildContext context) => Container(
    decoration: const BoxDecoration(
      color: recallCream,
      border: Border(top: BorderSide(color: Color(0xffe2ebe4))),
    ),
    padding: const EdgeInsets.fromLTRB(8, 8, 8, 4),
    child: Row(
      children: List.generate(5, (i) {
        final labels = ['Today', 'People', 'Speak', 'Actions', 'Settings'];
        final icons = [
          Icons.home_outlined,
          Icons.people_outline,
          Icons.mic_none_rounded,
          Icons.format_list_bulleted_rounded,
          Icons.settings_outlined,
        ];
        Widget icon = Icon(icons[i], color: recallInk, size: 26);
        if (i == 3) {
          icon = Badge(
            label: Text(
              count >= 1000
                  ? '1k+'
                  : count > 99
                  ? '99+'
                  : '$count',
            ),
            backgroundColor: const Color(0xffbc7540),
            child: icon,
          );
        }
        return Expanded(
          child: Semantics(
            selected: selected == i,
            button: true,
            child: InkWell(
              borderRadius: BorderRadius.circular(20),
              onTap: () => onSelected(i),
              child: Container(
                constraints: const BoxConstraints(minHeight: 70),
                padding: const EdgeInsets.symmetric(vertical: 7),
                decoration: BoxDecoration(
                  color: selected == i ? recallMint : Colors.transparent,
                  borderRadius: BorderRadius.circular(20),
                ),
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    if (i == 2)
                      Container(
                        width: 49,
                        height: 49,
                        decoration: const BoxDecoration(
                          shape: BoxShape.circle,
                          gradient: LinearGradient(
                            colors: [recallInk, Color(0xff236355)],
                          ),
                        ),
                        child: const Icon(
                          Icons.mic_none_rounded,
                          color: Colors.white,
                          size: 31,
                        ),
                      )
                    else
                      icon,
                    const SizedBox(height: 4),
                    Text(
                      labels[i],
                      style: TextStyle(
                        fontSize: 12,
                        color: recallInk,
                        fontWeight: selected == i
                            ? FontWeight.w700
                            : FontWeight.w500,
                      ),
                    ),
                  ],
                ),
              ),
            ),
          ),
        );
      }),
    ),
  );
}
