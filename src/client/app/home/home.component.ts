import {
  Injectable,
  Component,
  OnInit,
  NgIterable,
  IterableChanges,
  ChangeDetectorRef,
  TrackByFunction,
  IterableDiffer,
  IterableDifferFactory,
  IterableChangeRecord,
  IterableDiffers
} from '@angular/core';
import { NameListService } from '../shared/name-list/name-list.service';
import { List } from 'immutable';

export class IterableChangeRecord_<V> implements IterableChangeRecord<V> {
  currentIndex: number | null = null;
  previousIndex: number | null = null;

  /** @internal */
  _nextPrevious: IterableChangeRecord_<V> | null = null;
  /** @internal */
  _prev: IterableChangeRecord_<V> | null = null;
  /** @internal */
  _next: IterableChangeRecord_<V> | null = null;
  /** @internal */
  _prevDup: IterableChangeRecord_<V> | null = null;
  /** @internal */
  _nextDup: IterableChangeRecord_<V> | null = null;
  /** @internal */
  _prevRemoved: IterableChangeRecord_<V> | null = null;
  /** @internal */
  _nextRemoved: IterableChangeRecord_<V> | null = null;
  /** @internal */
  _nextAdded: IterableChangeRecord_<V> | null = null;
  /** @internal */
  _nextMoved: IterableChangeRecord_<V> | null = null;
  /** @internal */
  _nextIdentityChange: IterableChangeRecord_<V> | null = null;

  constructor(public item: V, public trackById: any) {}
}

export class _DuplicateMap<V> {
  map = new Map<any, _DuplicateItemRecordList<V>>();

  put(record: IterableChangeRecord_<V>) {
    const key = record.trackById;

    let duplicates = this.map.get(key);
    if (!duplicates) {
      duplicates = new _DuplicateItemRecordList<V>();
      this.map.set(key, duplicates);
    }
    duplicates.add(record);
  }

  /**
   * Retrieve the `value` using key. Because the IterableChangeRecord_ value may be one which we
   * have already iterated over, we use the `atOrAfterIndex` to pretend it is not there.
   *
   * Use case: `[a, b, c, a, a]` if we are at index `3` which is the second `a` then asking if we
   * have any more `a`s needs to return the second `a`.
   */
  get(trackById: any, atOrAfterIndex: number | null): IterableChangeRecord_<V> | null {
    const key = trackById;
    const recordList = this.map.get(key);
    return recordList ? recordList.get(trackById, atOrAfterIndex) : null;
  }

  /**
   * Removes a {@link IterableChangeRecord_} from the list of duplicates.
   *
   * The list of duplicates also is removed from the map if it gets empty.
   */
  remove(record: IterableChangeRecord_<V>): IterableChangeRecord_<V> {
    const key = record.trackById;
    const recordList: _DuplicateItemRecordList<V> = this.map.get(key)!;
    // Remove the list of duplicates when it gets empty
    if (recordList.remove(record)) {
      this.map.delete(key);
    }
    return record;
  }

  get isEmpty(): boolean {
    return this.map.size === 0;
  }

  clear() {
    this.map.clear();
  }
}

export function looseIdentical(a: any, b: any): boolean {
  return a === b || (typeof a === 'number' && typeof b === 'number' && isNaN(a) && isNaN(b));
}

// A linked list of CollectionChangeRecords with the same IterableChangeRecord_.item
export class _DuplicateItemRecordList<V> {
  /** @internal */
  _head: IterableChangeRecord_<V> | null = null;
  /** @internal */
  _tail: IterableChangeRecord_<V> | null = null;

  /**
   * Append the record to the list of duplicates.
   *
   * Note: by design all records in the list of duplicates hold the same value in record.item.
   */
  add(record: IterableChangeRecord_<V>): void {
    if (this._head === null) {
      this._head = this._tail = record;
      record._nextDup = null;
      record._prevDup = null;
    } else {
      // todo(vicb)
      // assert(record.item ==  _head.item ||
      //       record.item is num && record.item.isNaN && _head.item is num && _head.item.isNaN);
      this._tail!._nextDup = record;
      record._prevDup = this._tail;
      record._nextDup = null;
      this._tail = record;
    }
  }

  // Returns a IterableChangeRecord_ having IterableChangeRecord_.trackById == trackById and
  // IterableChangeRecord_.currentIndex >= atOrAfterIndex
  get(trackById: any, atOrAfterIndex: number | null): IterableChangeRecord_<V> | null {
    let record: IterableChangeRecord_<V> | null;
    for (record = this._head; record !== null; record = record._nextDup) {
      if (
        (atOrAfterIndex === null || atOrAfterIndex <= record.currentIndex!) &&
        looseIdentical(record.trackById, trackById)
      ) {
        return record;
      }
    }
    return null;
  }

  /**
   * Remove one {@link IterableChangeRecord_} from the list of duplicates.
   *
   * Returns whether the list of duplicates is empty.
   */
  remove(record: IterableChangeRecord_<V>): boolean {
    // todo(vicb)
    // assert(() {
    //  // verify that the record being removed is in the list.
    //  for (IterableChangeRecord_ cursor = _head; cursor != null; cursor = cursor._nextDup) {
    //    if (identical(cursor, record)) return true;
    //  }
    //  return false;
    //});
    const prev: IterableChangeRecord_<V> | null = record._prevDup;
    const next: IterableChangeRecord_<V> | null = record._nextDup;
    if (prev === null) {
      this._head = next;
    } else {
      prev._nextDup = next;
    }
    if (next === null) {
      this._tail = prev;
    } else {
      next._prevDup = prev;
    }
    return this._head === null;
  }
}

function getPreviousIndex(item: any, addRemoveOffset: number, moveOffsets: number[] | null): number {
  const previousIndex = item.previousIndex;
  if (previousIndex === null) return previousIndex;
  let moveOffset = 0;
  if (moveOffsets && previousIndex < moveOffsets.length) {
    moveOffset = moveOffsets[previousIndex];
  }
  return previousIndex + addRemoveOffset + moveOffset;
}

const trackByIdentity = (index: number, item: any) => item;

export function isJsObject(o: any): boolean {
  return o !== null && (typeof o === 'function' || typeof o === 'object');
}

let _symbolIterator: any = null;

export function getSymbolIterator(): string | symbol {
  if (!_symbolIterator) {
    const Symbol = (window as any)['Symbol'];
    if (Symbol && Symbol.iterator) {
      _symbolIterator = Symbol.iterator;
    } else {
      // es6-shim specific logic
      const keys = Object.getOwnPropertyNames(Map.prototype);
      for (let i = 0; i < keys.length; ++i) {
        const key = keys[i];
        if (key !== 'entries' && key !== 'size' && (Map as any).prototype[key] === Map.prototype['entries']) {
          _symbolIterator = key;
        }
      }
    }
  }
  return _symbolIterator;
}

export function isListLikeIterable(obj: any): boolean {
  if (!isJsObject(obj)) return false;
  return (
    Array.isArray(obj) ||
    (!(obj instanceof Map) && // JS Map are iterables but return entries as [k, v]
      getSymbolIterator() in obj)
  ); // JS Iterable have a Symbol.iterator prop
}

export function stringify(token: any): string {
  if (typeof token === 'string') {
    return token;
  }

  if (token instanceof Array) {
    return '[' + token.map(stringify).join(', ') + ']';
  }

  if (token == null) {
    return '' + token;
  }

  if (token.overriddenName) {
    return `${token.overriddenName}`;
  }

  if (token.name) {
    return `${token.name}`;
  }

  const res = token.toString();

  if (res == null) {
    return '' + res;
  }

  const newLineIndex = res.indexOf('\n');
  return newLineIndex === -1 ? res : res.substring(0, newLineIndex);
}

class ImmutableListIterableDiffer<V> implements IterableDiffer<V>, IterableChanges<V> {
  public readonly length: number = 0;
  public readonly collection: V[] | Iterable<V> | null;
  // Keeps track of the used records at any point in time (during & across `_check()` calls)
  private _linkedRecords: _DuplicateMap<V> | null = null;
  // Keeps track of the removed records at any point in time during `_check()` calls.
  private _unlinkedRecords: _DuplicateMap<V> | null = null;
  private _previousItHead: IterableChangeRecord_<V> | null = null;
  private _itHead: IterableChangeRecord_<V> | null = null;
  private _itTail: IterableChangeRecord_<V> | null = null;
  private _additionsHead: IterableChangeRecord_<V> | null = null;
  private _additionsTail: IterableChangeRecord_<V> | null = null;
  private _movesHead: IterableChangeRecord_<V> | null = null;
  private _movesTail: IterableChangeRecord_<V> | null = null;
  private _removalsHead: IterableChangeRecord_<V> | null = null;
  private _removalsTail: IterableChangeRecord_<V> | null = null;
  // Keeps track of records where custom track by is the same, but item identity has changed
  private _identityChangesHead: IterableChangeRecord_<V> | null = null;
  private _identityChangesTail: IterableChangeRecord_<V> | null = null;
  private _trackByFn: TrackByFunction<V>;

  constructor(trackByFn?: TrackByFunction<V>) {
    this._trackByFn = trackByFn || trackByIdentity;
  }

  forEachItem(fn: (record: IterableChangeRecord_<V>) => void) {
    let record: IterableChangeRecord_<V> | null;
    for (record = this._itHead; record !== null; record = record._next) {
      fn(record);
    }
  }

  forEachOperation(
    fn: (item: IterableChangeRecord<V>, previousIndex: number | null, currentIndex: number | null) => void
  ) {
    let nextIt = this._itHead;
    let nextRemove = this._removalsHead;
    let addRemoveOffset = 0;
    let moveOffsets: number[] | null = null;
    while (nextIt || nextRemove) {
      // Figure out which is the next record to process
      // Order: remove, add, move
      const record: IterableChangeRecord<V> =
        !nextRemove || (nextIt && nextIt.currentIndex! < getPreviousIndex(nextRemove, addRemoveOffset, moveOffsets))
          ? nextIt!
          : nextRemove;
      const adjPreviousIndex = getPreviousIndex(record, addRemoveOffset, moveOffsets);
      const currentIndex = record.currentIndex;

      // consume the item, and adjust the addRemoveOffset and update moveDistance if necessary
      if (record === nextRemove) {
        addRemoveOffset--;
        nextRemove = nextRemove._nextRemoved;
      } else {
        nextIt = nextIt!._next;
        if (record.previousIndex == null) {
          addRemoveOffset++;
        } else {
          // INVARIANT:  currentIndex < previousIndex
          if (!moveOffsets) moveOffsets = [];
          const localMovePreviousIndex = adjPreviousIndex - addRemoveOffset;
          const localCurrentIndex = currentIndex! - addRemoveOffset;
          if (localMovePreviousIndex != localCurrentIndex) {
            for (let i = 0; i < localMovePreviousIndex; i++) {
              const offset = i < moveOffsets.length ? moveOffsets[i] : (moveOffsets[i] = 0);
              const index = offset + i;
              if (localCurrentIndex <= index && index < localMovePreviousIndex) {
                moveOffsets[i] = offset + 1;
              }
            }
            const previousIndex = record.previousIndex;
            moveOffsets[previousIndex] = localCurrentIndex - localMovePreviousIndex;
          }
        }
      }

      if (adjPreviousIndex !== currentIndex) {
        fn(record, adjPreviousIndex, currentIndex);
      }
    }
  }

  forEachPreviousItem(fn: (record: IterableChangeRecord_<V>) => void) {
    let record: IterableChangeRecord_<V> | null;
    for (record = this._previousItHead; record !== null; record = record._nextPrevious) {
      fn(record);
    }
  }

  forEachAddedItem(fn: (record: IterableChangeRecord_<V>) => void) {
    let record: IterableChangeRecord_<V> | null;
    for (record = this._additionsHead; record !== null; record = record._nextAdded) {
      fn(record);
    }
  }

  forEachMovedItem(fn: (record: IterableChangeRecord_<V>) => void) {
    let record: IterableChangeRecord_<V> | null;
    for (record = this._movesHead; record !== null; record = record._nextMoved) {
      fn(record);
    }
  }

  forEachRemovedItem(fn: (record: IterableChangeRecord_<V>) => void) {
    let record: IterableChangeRecord_<V> | null;
    for (record = this._removalsHead; record !== null; record = record._nextRemoved) {
      fn(record);
    }
  }

  forEachIdentityChange(fn: (record: IterableChangeRecord_<V>) => void) {
    let record: IterableChangeRecord_<V> | null;
    for (record = this._identityChangesHead; record !== null; record = record._nextIdentityChange) {
      fn(record);
    }
  }

  diff(collection: NgIterable<V>): ImmutableListIterableDiffer<V> | null {
    if (collection == null) collection = [];
    if (!isListLikeIterable(collection)) {
      throw new Error(`Error trying to diff '${stringify(collection)}'. Only arrays and iterables are allowed`);
    }

    if (this.check(collection)) {
      return this;
    } else {
      return null;
    }
  }

  onDestroy() {}

  check(collection: NgIterable<V>): boolean {
    this._reset();

    let record: IterableChangeRecord_<V> | null = this._itHead;
    let mayBeDirty: boolean = false;
    let index: number;
    let item: V;
    let itemTrackBy: any;
    if (Array.isArray(collection)) {
      (this as { length: number }).length = collection.length;

      for (let index = 0; index < this.length; index++) {
        item = collection[index];
        itemTrackBy = this._trackByFn(index, item);
        if (record === null || !looseIdentical(record.trackById, itemTrackBy)) {
          record = this._mismatch(record, item, itemTrackBy, index);
          mayBeDirty = true;
        } else {
          if (mayBeDirty) {
            // TODO(misko): can we limit this to duplicates only?
            record = this._verifyReinsertion(record, item, itemTrackBy, index);
          }
          if (!looseIdentical(record.item, item)) this._addIdentityChange(record, item);
        }

        record = record._next;
      }
    } else {
      index = 0;
      iterateListLike(collection, (item: V) => {
        itemTrackBy = this._trackByFn(index, item);
        if (record === null || !looseIdentical(record.trackById, itemTrackBy)) {
          record = this._mismatch(record, item, itemTrackBy, index);
          mayBeDirty = true;
        } else {
          if (mayBeDirty) {
            // TODO(misko): can we limit this to duplicates only?
            record = this._verifyReinsertion(record, item, itemTrackBy, index);
          }
          if (!looseIdentical(record.item, item)) this._addIdentityChange(record, item);
        }
        record = record._next;
        index++;
      });
      (this as { length: number }).length = index;
    }

    this._truncate(record);
    (this as { collection: V[] | Iterable<V> }).collection = collection;
    return this.isDirty;
  }

  /* CollectionChanges is considered dirty if it has any additions, moves, removals, or identity
   * changes.
   */
  get isDirty(): boolean {
    return (
      this._additionsHead !== null ||
      this._movesHead !== null ||
      this._removalsHead !== null ||
      this._identityChangesHead !== null
    );
  }

  /**
   * Reset the state of the change objects to show no changes. This means set previousKey to
   * currentKey, and clear all of the queues (additions, moves, removals).
   * Set the previousIndexes of moved and added items to their currentIndexes
   * Reset the list of additions, moves and removals
   *
   * @internal
   */
  _reset() {
    if (this.isDirty) {
      let record: IterableChangeRecord_<V> | null;
      let nextRecord: IterableChangeRecord_<V> | null;

      for (record = this._previousItHead = this._itHead; record !== null; record = record._next) {
        record._nextPrevious = record._next;
      }

      for (record = this._additionsHead; record !== null; record = record._nextAdded) {
        record.previousIndex = record.currentIndex;
      }
      this._additionsHead = this._additionsTail = null;

      for (record = this._movesHead; record !== null; record = nextRecord) {
        record.previousIndex = record.currentIndex;
        nextRecord = record._nextMoved;
      }
      this._movesHead = this._movesTail = null;
      this._removalsHead = this._removalsTail = null;
      this._identityChangesHead = this._identityChangesTail = null;

      // todo(vicb) when assert gets supported
      // assert(!this.isDirty);
    }
  }

  /**
   * This is the core function which handles differences between collections.
   *
   * - `record` is the record which we saw at this position last time. If null then it is a new
   *   item.
   * - `item` is the current item in the collection
   * - `index` is the position of the item in the collection
   *
   * @internal
   */
  _mismatch(
    record: IterableChangeRecord_<V> | null,
    item: V,
    itemTrackBy: any,
    index: number
  ): IterableChangeRecord_<V> {
    // The previous record after which we will append the current one.
    let previousRecord: IterableChangeRecord_<V> | null;

    if (record === null) {
      previousRecord = this._itTail;
    } else {
      previousRecord = record._prev;
      // Remove the record from the collection since we know it does not match the item.
      this._remove(record);
    }

    // Attempt to see if we have seen the item before.
    record = this._linkedRecords === null ? null : this._linkedRecords.get(itemTrackBy, index);
    if (record !== null) {
      // We have seen this before, we need to move it forward in the collection.
      // But first we need to check if identity changed, so we can update in view if necessary
      if (!looseIdentical(record.item, item)) this._addIdentityChange(record, item);

      this._moveAfter(record, previousRecord, index);
    } else {
      // Never seen it, check evicted list.
      record = this._unlinkedRecords === null ? null : this._unlinkedRecords.get(itemTrackBy, null);
      if (record !== null) {
        // It is an item which we have evicted earlier: reinsert it back into the list.
        // But first we need to check if identity changed, so we can update in view if necessary
        if (!looseIdentical(record.item, item)) this._addIdentityChange(record, item);

        this._reinsertAfter(record, previousRecord, index);
      } else {
        // It is a new item: add it.
        record = this._addAfter(new IterableChangeRecord_<V>(item, itemTrackBy), previousRecord, index);
      }
    }
    return record;
  }

  /**
   * This check is only needed if an array contains duplicates. (Short circuit of nothing dirty)
   *
   * Use case: `[a, a]` => `[b, a, a]`
   *
   * If we did not have this check then the insertion of `b` would:
   *   1) evict first `a`
   *   2) insert `b` at `0` index.
   *   3) leave `a` at index `1` as is. <-- this is wrong!
   *   3) reinsert `a` at index 2. <-- this is wrong!
   *
   * The correct behavior is:
   *   1) evict first `a`
   *   2) insert `b` at `0` index.
   *   3) reinsert `a` at index 1.
   *   3) move `a` at from `1` to `2`.
   *
   *
   * Double check that we have not evicted a duplicate item. We need to check if the item type may
   * have already been removed:
   * The insertion of b will evict the first 'a'. If we don't reinsert it now it will be reinserted
   * at the end. Which will show up as the two 'a's switching position. This is incorrect, since a
   * better way to think of it is as insert of 'b' rather then switch 'a' with 'b' and then add 'a'
   * at the end.
   *
   * @internal
   */
  _verifyReinsertion(
    record: IterableChangeRecord_<V>,
    item: V,
    itemTrackBy: any,
    index: number
  ): IterableChangeRecord_<V> {
    let reinsertRecord: IterableChangeRecord_<V> | null =
      this._unlinkedRecords === null ? null : this._unlinkedRecords.get(itemTrackBy, null);
    if (reinsertRecord !== null) {
      record = this._reinsertAfter(reinsertRecord, record._prev!, index);
    } else if (record.currentIndex != index) {
      record.currentIndex = index;
      this._addToMoves(record, index);
    }
    return record;
  }

  /**
   * Get rid of any excess {@link IterableChangeRecord_}s from the previous collection
   *
   * - `record` The first excess {@link IterableChangeRecord_}.
   *
   * @internal
   */
  _truncate(record: IterableChangeRecord_<V> | null) {
    // Anything after that needs to be removed;
    while (record !== null) {
      const nextRecord: IterableChangeRecord_<V> | null = record._next;
      this._addToRemovals(this._unlink(record));
      record = nextRecord;
    }
    if (this._unlinkedRecords !== null) {
      this._unlinkedRecords.clear();
    }

    if (this._additionsTail !== null) {
      this._additionsTail._nextAdded = null;
    }
    if (this._movesTail !== null) {
      this._movesTail._nextMoved = null;
    }
    if (this._itTail !== null) {
      this._itTail._next = null;
    }
    if (this._removalsTail !== null) {
      this._removalsTail._nextRemoved = null;
    }
    if (this._identityChangesTail !== null) {
      this._identityChangesTail._nextIdentityChange = null;
    }
  }

  /** @internal */
  _reinsertAfter(
    record: IterableChangeRecord_<V>,
    prevRecord: IterableChangeRecord_<V> | null,
    index: number
  ): IterableChangeRecord_<V> {
    if (this._unlinkedRecords !== null) {
      this._unlinkedRecords.remove(record);
    }
    const prev = record._prevRemoved;
    const next = record._nextRemoved;

    if (prev === null) {
      this._removalsHead = next;
    } else {
      prev._nextRemoved = next;
    }
    if (next === null) {
      this._removalsTail = prev;
    } else {
      next._prevRemoved = prev;
    }

    this._insertAfter(record, prevRecord, index);
    this._addToMoves(record, index);
    return record;
  }

  /** @internal */
  _moveAfter(
    record: IterableChangeRecord_<V>,
    prevRecord: IterableChangeRecord_<V> | null,
    index: number
  ): IterableChangeRecord_<V> {
    this._unlink(record);
    this._insertAfter(record, prevRecord, index);
    this._addToMoves(record, index);
    return record;
  }

  /** @internal */
  _addAfter(
    record: IterableChangeRecord_<V>,
    prevRecord: IterableChangeRecord_<V> | null,
    index: number
  ): IterableChangeRecord_<V> {
    this._insertAfter(record, prevRecord, index);

    if (this._additionsTail === null) {
      // todo(vicb)
      // assert(this._additionsHead === null);
      this._additionsTail = this._additionsHead = record;
    } else {
      // todo(vicb)
      // assert(_additionsTail._nextAdded === null);
      // assert(record._nextAdded === null);
      this._additionsTail = this._additionsTail._nextAdded = record;
    }
    return record;
  }

  /** @internal */
  _insertAfter(
    record: IterableChangeRecord_<V>,
    prevRecord: IterableChangeRecord_<V> | null,
    index: number
  ): IterableChangeRecord_<V> {
    // todo(vicb)
    // assert(record != prevRecord);
    // assert(record._next === null);
    // assert(record._prev === null);
    const next: IterableChangeRecord_<V> | null = prevRecord === null ? this._itHead : prevRecord._next;
    // todo(vicb)
    // assert(next != record);
    // assert(prevRecord != record);
    record._next = next;
    record._prev = prevRecord;
    if (next === null) {
      this._itTail = record;
    } else {
      next._prev = record;
    }
    if (prevRecord === null) {
      this._itHead = record;
    } else {
      prevRecord._next = record;
    }

    if (this._linkedRecords === null) {
      this._linkedRecords = new _DuplicateMap<V>();
    }
    this._linkedRecords.put(record);

    record.currentIndex = index;
    return record;
  }

  /** @internal */
  _remove(record: IterableChangeRecord_<V>): IterableChangeRecord_<V> {
    return this._addToRemovals(this._unlink(record));
  }

  /** @internal */
  _unlink(record: IterableChangeRecord_<V>): IterableChangeRecord_<V> {
    if (this._linkedRecords !== null) {
      this._linkedRecords.remove(record);
    }

    const prev = record._prev;
    const next = record._next;

    // todo(vicb)
    // assert((record._prev = null) === null);
    // assert((record._next = null) === null);
    if (prev === null) {
      this._itHead = next;
    } else {
      prev._next = next;
    }
    if (next === null) {
      this._itTail = prev;
    } else {
      next._prev = prev;
    }

    return record;
  }

  /** @internal */
  _addToMoves(record: IterableChangeRecord_<V>, toIndex: number): IterableChangeRecord_<V> {
    // todo(vicb)
    // assert(record._nextMoved === null);
    if (record.previousIndex === toIndex) {
      return record;
    }

    if (this._movesTail === null) {
      // todo(vicb)
      // assert(_movesHead === null);
      this._movesTail = this._movesHead = record;
    } else {
      // todo(vicb)
      // assert(_movesTail._nextMoved === null);
      this._movesTail = this._movesTail._nextMoved = record;
    }

    return record;
  }

  private _addToRemovals(record: IterableChangeRecord_<V>): IterableChangeRecord_<V> {
    if (this._unlinkedRecords === null) {
      this._unlinkedRecords = new _DuplicateMap<V>();
    }
    this._unlinkedRecords.put(record);
    record.currentIndex = null;
    record._nextRemoved = null;

    if (this._removalsTail === null) {
      // todo(vicb)
      // assert(_removalsHead === null);
      this._removalsTail = this._removalsHead = record;
      record._prevRemoved = null;
    } else {
      // todo(vicb)
      // assert(_removalsTail._nextRemoved === null);
      // assert(record._nextRemoved === null);
      record._prevRemoved = this._removalsTail;
      this._removalsTail = this._removalsTail._nextRemoved = record;
    }
    return record;
  }

  /** @internal */
  _addIdentityChange(record: IterableChangeRecord_<V>, item: V) {
    record.item = item;
    if (this._identityChangesTail === null) {
      this._identityChangesTail = this._identityChangesHead = record;
    } else {
      this._identityChangesTail = this._identityChangesTail._nextIdentityChange = record;
    }
    return record;
  }
}

enum ChangeType {
  Update,
  Add,
  Remove,
  Move
}

class IterableChangeRecordType<V> {
  constructor(public record: IterableChangeRecord<V>, public type: ChangeType) {}
}

////////////////////////////////////////////////////
class PersistentListIterableDifferIterator<V> implements Iterator<V> {
  private _pointer = 0;

  constructor(private _data: PersistentListIterableDiffer<V>) {}

  public next(): IteratorResult<V> {
    if (this._pointer < this._data.length) {
      return {
        done: false,
        value: this._data.get(this._pointer++)
      };
    } else {
      return {
        done: true,
        value: null
      };
    }
  }
}

export class PersistentListIterableDiffer<V> implements IterableDiffer<V>, IterableChanges<V> {
  private _itemIdx = new Map<V, number[]>();
  private _trackByFn: TrackByFunction<V>;
  private _data: IterableChangeRecord<V>[] = [];
  private _bufferedChanges: IterableChangeRecordType<V>[] = [];
  private _changes: IterableChangeRecordType<V>[] = [];

  constructor() {
    this._trackByFn = trackByIdentity;
  }

  get collection() {
    return this._data.map(v => v.item);
  }

  get length() {
    return this._data.length;
  }

  get(idx: number): V {
    return this._data[idx].item;
  }

  [Symbol.iterator](): PersistentListIterableDifferIterator<V> {
    return new PersistentListIterableDifferIterator(this);
  }

  push(value: V): number {
    const data: IterableChangeRecord<V> = {
      currentIndex: this._data.length,
      previousIndex: null,
      item: value,
      trackById: this._trackByFn
    };
    const change = new IterableChangeRecordType(data, ChangeType.Add);
    this._bufferedChanges.push(change);
    return this._data.push(data);
  }

  unshift(value: V): number {
    const data: IterableChangeRecord<V> = {
      currentIndex: 0,
      previousIndex: null,
      item: value,
      trackById: this._trackByFn
    };
    const change = new IterableChangeRecordType(data, ChangeType.Add);
    this._bufferedChanges.push(change);
    return this._data.push(data);
  }

  set(idx: number, value: V) {
    const data: IterableChangeRecord<V> = {
      currentIndex: idx,
      previousIndex: null,
      item: value,
      trackById: this._trackByFn
    };
    const change = new IterableChangeRecordType(data, ChangeType.Add);
    this._bufferedChanges.push(change);
    if (this._data[idx]) {
      this._bufferedChanges.push(
        new IterableChangeRecordType(
          {
            currentIndex: null,
            previousIndex: idx,
            item: this._data[idx].item,
            trackById: this._trackByFn
          },
          ChangeType.Remove
        )
      );
    }
    return (this._data[idx] = data);
  }

  indexOf(item: V) {
    for (let i = 0; i < this._data.length; i += 1) {
      if (looseIdentical(this._data[i].item, item)) {
        return i;
      }
    }
    return -1;
  }

  removeIndex(idx: number) {
    const data: IterableChangeRecord<V> = {
      currentIndex: null,
      previousIndex: idx,
      item: this.get(idx),
      trackById: this._trackByFn
    };
    const change = new IterableChangeRecordType(data, ChangeType.Remove);
    this._bufferedChanges.push(change);
    return data.item;
  }

  forEachItem(fn: (record: IterableChangeRecord<V>) => void) {
    for (let i = 0; i < this._data.length; i += 1) {
      fn(this._data[i]);
    }
  }

  forEachOperation(
    fn: (item: IterableChangeRecord<V>, previousIndex: number | null, currentIndex: number | null) => void
  ) {
    for (let i = 0; i < this._changes.length; i += 1) {
      const record = this._changes[i].record;
      fn(record, record.previousIndex, record.currentIndex);
    }
  }

  forEachPreviousItem(fn: (record: IterableChangeRecord_<V>) => void) {
    // Do nothing
  }

  forEachAddedItem(fn: (record: IterableChangeRecord<V>) => void) {
    for (let i = 0; i < this._changes.length; i += 1) {
      const record = this._changes[i];
      if (record.type === ChangeType.Add) {
        fn(record.record);
      }
    }
  }

  forEachMovedItem(fn: (record: IterableChangeRecord<V>) => void) {
    for (let i = 0; i < this._changes.length; i += 1) {
      const record = this._changes[i];
      if (record.type === ChangeType.Move) {
        fn(record.record);
      }
    }
  }

  forEachRemovedItem(fn: (record: IterableChangeRecord<V>) => void) {
    for (let i = 0; i < this._changes.length; i += 1) {
      const record = this._changes[i];
      if (record.type === ChangeType.Remove) {
        fn(record.record);
      }
    }
  }

  forEachIdentityChange(fn: (record: IterableChangeRecord<V>) => void) {
    for (let i = 0; i < this._changes.length; i += 1) {
      const record = this._changes[i];
      if (record.type === ChangeType.Update) {
        fn(record.record);
      }
    }
  }

  diff(collection: NgIterable<V>): PersistentListIterableDiffer<V> | null {
    if (this.check()) {
      return this;
    } else {
      return null;
    }
  }

  onDestroy() {}

  check(): boolean {
    this._changes = this._bufferedChanges;
    this._reset();
    return this.isDirty;
  }

  /* CollectionChanges is considered dirty if it has any additions, moves, removals, or identity
   * changes.
   */
  get isDirty(): boolean {
    return this._changes.length > 0;
  }

  /**
   * Reset the state of the change objects to show no changes. This means set previousKey to
   * currentKey, and clear all of the queues (additions, moves, removals).
   * Set the previousIndexes of moved and added items to their currentIndexes
   * Reset the list of additions, moves and removals
   *
   * @internal
   */
  _reset() {
    if (this.isDirty) {
      this._bufferedChanges = [];
    }
  }
}
////////////////////////////////////////////////////

@Injectable()
export class ImmutableListIterableDifferFactory<V> implements IterableDifferFactory {
  constructor(private differ: PersistentListIterableDiffer<V>) {}

  supports(objects: any): boolean {
    return true;
  }

  create(trackByFn?: TrackByFunction<V>): IterableDiffer<V> {
    return this.differ;
  }
}

export function iterateListLike(obj: any, fn: (p: any) => any) {
  if (Array.isArray(obj)) {
    for (let i = 0; i < obj.length; i++) {
      fn(obj[i]);
    }
  } else {
    const iterator = obj[getSymbolIterator()]();
    let item: any;
    while (!(item = iterator.next()).done) {
      fn(item.value);
    }
  }
}

/**
 * This class represents the lazy loaded HomeComponent.
 */
@Component({
  moduleId: module.id,
  selector: 'sd-home',
  templateUrl: 'home.component.html',
  styleUrls: ['home.component.css'],
  providers: [
    {
      provide: PersistentListIterableDiffer,
      useClass: PersistentListIterableDiffer
    },
    {
      provide: IterableDiffers,
      useFactory<V>(differ: PersistentListIterableDiffer<V>) {
        return new IterableDiffers([new ImmutableListIterableDifferFactory(differ)]);
      },
      deps: [PersistentListIterableDiffer]
    }
  ]
})
export class HomeComponent implements OnInit {
  newName: string = '';
  errorMessage: string;

  /**
   * Creates an instance of the HomeComponent with the injected
   * NameListService.
   *
   * @param {NameListService} nameListService - The injected NameListService.
   */
  constructor(public nameListService: NameListService, public names: PersistentListIterableDiffer<string>) {}

  /**
   * Get the names OnInit
   */
  ngOnInit() {
    this.getNames();
  }

  /**
   * Handle the nameListService observable
   */
  getNames() {
    // this.nameListService.get().subscribe(names => (this.names = names), error => (this.errorMessage = <any>error));
  }

  /**
   * Pushes a new name onto the names array
   * @return {boolean} false to prevent default form submit behavior to refresh the page.
   */
  addName(): boolean {
    // TODO: implement nameListService.post
    this.names.push(this.newName);
    this.newName = '';
    return false;
  }
}
