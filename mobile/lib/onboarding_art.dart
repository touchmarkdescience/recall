import 'package:flutter/material.dart';

const _green = Color(0xff173c34);
const _mint = Color(0xffe1f0e7);
const _gold = Color(0xfff6d58c);

class OnboardingArt extends StatelessWidget {
  final int page;
  const OnboardingArt(this.page, {super.key});
  Widget card(Widget child, {Color color = Colors.white}) => Container(
    padding: const EdgeInsets.all(18),
    decoration: BoxDecoration(
      color: color,
      borderRadius: BorderRadius.circular(26),
      border: Border.all(color: Colors.white, width: 2),
      boxShadow: const [
        BoxShadow(
          color: Color(0x1f235e43),
          blurRadius: 24,
          offset: Offset(0, 14),
        ),
      ],
    ),
    child: child,
  );
  Widget icon(IconData value, {Color color = _mint}) => Container(
    padding: const EdgeInsets.all(12),
    decoration: BoxDecoration(
      color: color,
      borderRadius: BorderRadius.circular(16),
    ),
    child: Icon(value, size: 30, color: _green),
  );
  Widget text(String value, {double size = 18, bool bold = true}) => Text(
    value,
    style: TextStyle(
      fontSize: size,
      fontWeight: bold ? FontWeight.w700 : FontWeight.normal,
      color: _green,
    ),
  );
  Widget fitRow({required List<Widget> children}) => FittedBox(
    fit: BoxFit.scaleDown,
    alignment: Alignment.centerLeft,
    child: Row(mainAxisSize: MainAxisSize.min, children: children),
  );
  @override
  Widget build(BuildContext context) => ExcludeSemantics(
    child: FittedBox(
      fit: BoxFit.contain,
      child: SizedBox(
        width: 340,
        height: 320,
        child: Stack(
          alignment: Alignment.center,
          children: [
            Container(
              width: 300,
              height: 290,
              decoration: BoxDecoration(
                borderRadius: BorderRadius.circular(130),
                gradient: const RadialGradient(
                  colors: [_mint, Color(0xfff7faf5)],
                ),
              ),
            ),
            if (page == 0) ...[
              for (final diameter in [270.0, 220.0])
                Container(
                  width: diameter,
                  height: diameter,
                  decoration: BoxDecoration(
                    shape: BoxShape.circle,
                    color: _mint.withValues(alpha: 0.45),
                  ),
                ),
              Positioned(
                top: 60,
                left: 108,
                child: Container(
                  width: 124,
                  height: 124,
                  decoration: BoxDecoration(
                    shape: BoxShape.circle,
                    border: Border.all(color: _gold, width: 8),
                    gradient: const LinearGradient(
                      colors: [_green, Color(0xff236757)],
                    ),
                  ),
                  child: const Icon(
                    Icons.mic,
                    color: Color(0xfff4f9ec),
                    size: 68,
                  ),
                ),
              ),
              Positioned(top: 101, left: 30, child: _bars()),
              Positioned(top: 101, right: 30, child: _bars()),
              Positioned(
                bottom: 26,
                left: 28,
                right: 28,
                child: card(
                  fitRow(
                    children: [
                      icon(Icons.mic_none),
                      const SizedBox(width: 12),
                      Flexible(
                        child: Text(
                          'I spoke with Arjun…',
                          style: const TextStyle(
                            fontSize: 19,
                            fontStyle: FontStyle.italic,
                            color: _green,
                          ),
                        ),
                      ),
                    ],
                  ),
                ),
              ),
            ] else if (page == 1) ...[
              Positioned(
                top: 52,
                left: 20,
                right: 35,
                child: card(
                  Column(
                    children: [
                      Container(
                        height: 24,
                        decoration: BoxDecoration(
                          color: _gold,
                          borderRadius: BorderRadius.circular(10),
                        ),
                      ),
                      const SizedBox(height: 22),
                      fitRow(
                        children: [
                          icon(Icons.calendar_today_outlined),
                          const SizedBox(width: 12),
                          text('Tomorrow · 6:00 PM'),
                        ],
                      ),
                      const SizedBox(height: 32),
                    ],
                  ),
                ),
              ),
              Positioned(
                bottom: 30,
                left: 55,
                right: 5,
                child: card(
                  fitRow(
                    children: [
                      icon(
                        Icons.notifications_outlined,
                        color: const Color(0xffffefcc),
                      ),
                      const SizedBox(width: 12),
                      Flexible(
                        child: text('1 hour before · 5:00 PM', size: 16),
                      ),
                    ],
                  ),
                  color: const Color(0xfff3f8f2),
                ),
              ),
            ] else ...[
              Positioned(
                top: 5,
                bottom: 5,
                left: 14,
                right: 14,
                child: card(
                  Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      fitRow(
                        children: [
                          const CircleAvatar(
                            radius: 26,
                            backgroundColor: _mint,
                            child: Text(
                              'A',
                              style: TextStyle(fontSize: 29, color: _green),
                            ),
                          ),
                          const SizedBox(width: 14),
                          Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              text('Arjun', size: 24),
                              text(
                                'Sales lead · Acme Corp',
                                size: 13,
                                bold: false,
                              ),
                            ],
                          ),
                        ],
                      ),
                      const SizedBox(height: 4),
                      const Divider(color: _mint, height: 8),
                      const SizedBox(height: 4),
                      fitRow(
                        children: [
                          const Icon(Icons.circle, size: 15, color: _green),
                          const SizedBox(width: 12),
                          Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              text('Discussed the PPT', size: 19),
                              text('Today, 10:30 AM', size: 15, bold: false),
                            ],
                          ),
                        ],
                      ),
                      const SizedBox(height: 8),
                      Container(
                        padding: const EdgeInsets.all(10),
                        decoration: BoxDecoration(
                          color: const Color(0xfffff2d8),
                          borderRadius: BorderRadius.circular(18),
                        ),
                        child: fitRow(
                          children: [
                            const Icon(
                              Icons.description_outlined,
                              color: _green,
                            ),
                            const SizedBox(width: 10),
                            Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                text('Send the PPT by 6 PM', size: 16),
                                text('Pending', size: 13, bold: false),
                              ],
                            ),
                          ],
                        ),
                      ),
                    ],
                  ),
                ),
              ),
            ],
          ],
        ),
      ),
    ),
  );
  Widget _bars() => fitRow(
    children: List.generate(
      5,
      (i) => Container(
        width: 4,
        height: 12.0 + (2 - (2 - i).abs()) * 10,
        margin: const EdgeInsets.symmetric(horizontal: 3),
        decoration: BoxDecoration(
          color: const Color(0xff9bcab2),
          borderRadius: BorderRadius.circular(4),
        ),
      ),
    ),
  );
}
