"""Command line of parcel-desk: python3 -m shipping quote | label | manifest."""

import argparse
from datetime import date

from shipping import labels, manifest, quote


def main(argv):
    """Run one command with the arguments in argv (without the program name); return the exit code."""
    args = _parser().parse_args(argv)
    try:
        return args.command(args)
    except ValueError as error:
        print(f"error: {error}")
        return 1


def _parser():
    parser = argparse.ArgumentParser(prog="python3 -m shipping", description="Parcel prices, labels and manifests.")
    commands = parser.add_subparsers(required=True, metavar="command")

    quote_parser = commands.add_parser("quote", help="price a parcel; writes nothing")
    _add_parcel_arguments(quote_parser)
    quote_parser.set_defaults(command=_quote)

    label_parser = commands.add_parser("label", help="price a parcel and write its label to the spool")
    _add_parcel_arguments(label_parser)
    label_parser.add_argument("--to", required=True, help="recipient name printed on the label")
    label_parser.set_defaults(command=_label)

    manifest_parser = commands.add_parser("manifest", help="build the carrier manifest for a day")
    manifest_parser.add_argument("--day", type=date.fromisoformat, help="YYYY-MM-DD, default today")
    manifest_parser.set_defaults(command=_manifest)
    return parser


def _add_parcel_arguments(parser):
    parser.add_argument("--weight", type=int, required=True, help="weight in grams")
    parser.add_argument("--postcode", required=True, help="six-digit postcode")
    parser.add_argument("--service", action="append", default=[], help="service code, repeatable")
    parser.add_argument("--declared", type=int, help="declared value in kopecks")


def _quote_from(args):
    return quote.quote_parcel(args.weight, args.postcode, args.service, args.declared)


def _quote(args):
    result = _quote_from(args)
    print(f"zone: {result['zone']}")
    print(f"total: {_rubles_and_kopecks(result['total_kopecks'])} RUB")
    print(f"ships: {result['ship_date']}")
    return 0


def _label(args):
    label = labels.make_label(_quote_from(args), args.to)
    print(f"label {label['seq']:06d}: {label['tracking']}, ships {label['ship_date']}")
    return 0


def _manifest(args):
    path = manifest.build_manifest(args.day)
    print(f"manifest written: {path}")
    return 0


def _rubles_and_kopecks(kopecks):
    return f"{kopecks // 100}.{kopecks % 100:02d}"
