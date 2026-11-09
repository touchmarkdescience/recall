import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'recall_api.dart';

class AccountSettings extends StatelessWidget {
  final Future<void> Function(String)? onDelete;
  const AccountSettings({super.key, this.onDelete});

  Future<void> openPage(BuildContext context, String path) async {
    final url = '$apiUrl/$path';
    try {
      await const MethodChannel(
        'recall/device_settings',
      ).invokeMethod('openUrl', url);
    } catch (_) {
      if (!context.mounted) return;
      await showDialog<void>(
        context: context,
        builder: (context) => AlertDialog(
          title: const Text('Open in your browser'),
          content: SelectableText(url),
          actions: [
            TextButton(
              onPressed: () => Navigator.pop(context),
              child: const Text('Close'),
            ),
          ],
        ),
      );
    }
  }

  @override
  Widget build(BuildContext context) => Column(
    children: [
      TextButton.icon(
        onPressed: () => openPage(context, 'privacy'),
        icon: const Icon(Icons.privacy_tip_outlined),
        label: const Text('Privacy policy'),
      ),
      TextButton.icon(
        onPressed: () => openPage(context, 'delete-account'),
        icon: const Icon(Icons.help_outline),
        label: const Text('Account deletion help'),
      ),
      if (onDelete != null)
        TextButton.icon(
          onPressed: () => showDialog<void>(
            context: context,
            barrierDismissible: false,
            builder: (_) => _DeleteDialog(onDelete: onDelete!),
          ),
          icon: const Icon(Icons.delete_outline),
          label: const Text('Delete account'),
          style: TextButton.styleFrom(foregroundColor: const Color(0xffa33f35)),
        ),
    ],
  );
}

class _DeleteDialog extends StatefulWidget {
  final Future<void> Function(String) onDelete;
  const _DeleteDialog({required this.onDelete});
  @override
  State<_DeleteDialog> createState() => _DeleteDialogState();
}

class _DeleteDialogState extends State<_DeleteDialog> {
  final password = TextEditingController();
  bool confirmed = false, busy = false;
  String? error;
  @override
  void dispose() {
    password.dispose();
    super.dispose();
  }

  Future<void> submit() async {
    setState(() {
      busy = true;
      error = null;
    });
    try {
      await widget.onDelete(password.text);
      if (mounted) {
        Navigator.pop(context);
      }
    } catch (_) {
      if (mounted) {
        setState(() {
          busy = false;
          error =
              'Could not delete your account. Check your password and connection. If this server needs updating, contact mohan@touchmarkdes.com.';
        });
      }
    }
  }

  @override
  Widget build(BuildContext context) => PopScope(
    canPop: !busy,
    child: AlertDialog(
      title: const Text('Delete your Recall account?'),
      content: SingleChildScrollView(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const Text(
              'This permanently deletes your Recall account, people, conversations, actions and settings. Copies exported to Google Sheets must be deleted separately by the Sheet owner.',
            ),
            const SizedBox(height: 16),
            TextField(
              controller: password,
              onChanged: (_) => setState(() {}),
              obscureText: true,
              enabled: !busy,
              decoration: const InputDecoration(labelText: 'Current password'),
            ),
            CheckboxListTile(
              value: confirmed,
              contentPadding: EdgeInsets.zero,
              onChanged: busy
                  ? null
                  : (value) => setState(() => confirmed = value ?? false),
              title: const Text('I understand this cannot be undone.'),
            ),
            if (error != null)
              Text(error!, style: const TextStyle(color: Colors.red)),
          ],
        ),
      ),
      actions: [
        TextButton(
          onPressed: busy ? null : () => Navigator.pop(context),
          child: const Text('Cancel'),
        ),
        FilledButton(
          onPressed: busy || !confirmed || password.text.isEmpty
              ? null
              : submit,
          child: Text(busy ? 'Deleting…' : 'Delete permanently'),
        ),
      ],
    ),
  );
}
