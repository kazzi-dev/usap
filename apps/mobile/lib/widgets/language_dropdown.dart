import 'package:flutter/material.dart';

import '../models/protocol.dart';

class LanguageDropdown extends StatelessWidget {
  const LanguageDropdown({super.key, required this.value, required this.onChanged, this.compact = false});

  final String value;
  final ValueChanged<String> onChanged;

  /// Compact = short labels for the in-call header.
  final bool compact;

  @override
  Widget build(BuildContext context) {
    return DropdownButton<String>(
      value: value,
      isDense: compact,
      underline: compact ? const SizedBox.shrink() : null,
      items: [
        for (final language in languages)
          DropdownMenuItem(value: language.code, child: Text(compact ? language.native : language.displayName)),
      ],
      onChanged: (code) {
        if (code != null) onChanged(code);
      },
    );
  }
}
