import { Component, HostListener, ElementRef, NgZone, ViewChild, OnDestroy, OnInit } from '@angular/core';
import { DecksService } from '../data-services/services/decks.service';
import { CardsService } from '../data-services/services/cards.service';
import { CardTemplatesService } from '../data-services/services/card-templates.service';
import { Card } from '../data-services/types/card.type';
import { FieldType } from '../data-services/types/field-type.type';
import { MenuItem } from 'primeng/api';
import { ContextMenu } from 'primeng/contextmenu';
import { CdkDragDrop, CdkDragEnd, CdkDragEnter, CdkDragStart, DragRef, Point, moveItemInArray, transferArrayItem } from '@angular/cdk/drag-drop';
import StringUtils from '../shared/utils/string-utils';
import MathUtils from '../shared/utils/math-utils';
import { EntityField } from '../data-services/types/entity-field.type';
import { TranslateService } from '@ngx-translate/core';
import { GameSimulatorStateService } from './game-simulator-state.service';
import { CardStack, CardZone, GameCard, GameComponent, Position, Positionable } from './game-simulator.types';



@Component({
  selector: 'app-game-simulator',
  templateUrl: './game-simulator.component.html',
  styleUrl: './game-simulator.component.scss',
  standalone: false
})
export class GameSimulatorComponent implements OnInit, OnDestroy {
  private static readonly COLORS = ['copper', 'silver', 'gold', 'crimson',
    'emerald', 'azure', 'lilac', 'ivory', 'charcoal'];
  public static readonly BASE_CARD_WIDTH = 825; // Approximated from visual reference or default - Fallback only
  public static readonly BASE_CARD_HEIGHT = 1125;
  static readonly TABLE_MIN = -5000;
  static readonly TABLE_MAX = 5000;

  public readonly baseCardWidth = GameSimulatorComponent.BASE_CARD_WIDTH;
  public readonly baseCardHeight = GameSimulatorComponent.BASE_CARD_HEIGHT;

  @ViewChild('gameBoundary') gameBoundary!: ElementRef;

  get stacks() { return this.gameStateService.stacks; }
  get field() { return this.gameStateService.field; }
  get components() { return this.gameStateService.components; }
  get discard() { return this.gameStateService.discard; }

  get simulatorPan() { return this.gameStateService.simulatorPan; }
  set simulatorPan(value: Position) { this.gameStateService.simulatorPan = value; }
  get simulatorZoom() { return this.gameStateService.simulatorZoom; }
  set simulatorZoom(value: number) { this.gameStateService.simulatorZoom = value; }
  get dragScale() { return this.simulatorZoom; }

  get tableStyle() {
    const size = GameSimulatorComponent.TABLE_MAX - GameSimulatorComponent.TABLE_MIN;
    return {
      top: GameSimulatorComponent.TABLE_MIN + 'px',
      left: GameSimulatorComponent.TABLE_MIN + 'px',
      width: size + 'px',
      height: size + 'px'
    };
  }

  offScreenIndicators = { top: 0, bottom: 0, left: 0, right: 0 };
  private isPanning = false;
  public isShiftPressed = false;
  public isCtrlPressed = false;

  private _scaledPosMap = new Map<string, Point | any>();
  private _lastZoomForScaledPos = 1;

  public getScaledPos(item: Positionable): Point {
    if (this._lastZoomForScaledPos !== this.simulatorZoom) {
      this._lastZoomForScaledPos = this.simulatorZoom;
      this._scaledPosMap.clear();
    }

    let cached = this._scaledPosMap.get((item as any).uniqueId);
    if (!cached || cached.sourceX !== item.pos.x || cached.sourceY !== item.pos.y) {
      cached = {
        x: item.pos.x * this.simulatorZoom,
        y: item.pos.y * this.simulatorZoom,
        sourceX: item.pos.x,
        sourceY: item.pos.y
      };
      this._scaledPosMap.set((item as any).uniqueId, cached);
    }
    return cached;
  }
  private lastPanPos = { x: 0, y: 0 };

  zoomMagnifiedLevel: number = 0.40;
  contextMenuItems: MenuItem[] = [];
  hoveredItem: Positionable | undefined;
  draggingCard: boolean = false;
  draggingStack: boolean = false;
  draggingComponent: boolean = false;

  renameDialogVisible: boolean = false;
  renameStackName: string = '';
  shortcutsVisible: boolean = false;
  stackToRename: CardStack | undefined;
  isZooming: boolean = false;
  private zoomTimeout: any;

  saveStackName() {
    if (this.stackToRename && this.renameStackName.trim().length > 0) {
      this.stackToRename.name = this.renameStackName;
      this.renameDialogVisible = false;
    }
  }

  cancelRename() {
    this.renameDialogVisible = false;
    this.stackToRename = undefined;
    this.renameStackName = '';
  }

  showShortcuts() {
    this.shortcutsVisible = true;
  }

  drawSpecificCardDialogVisible: boolean = false;
  drawSpecificCardSearchQuery: string = '';
  drawSpecificCardStack: CardStack | undefined;
  filteredCards: GameCard[] = [];
  drawSpecificCardRevealHidden: boolean = false;

  openDrawSpecificCardDialog(stack: CardStack) {
    this.drawSpecificCardStack = stack;
    this.drawSpecificCardSearchQuery = '';
    this.drawSpecificCardRevealHidden = false;
    this.filterCards();
    this.drawSpecificCardDialogVisible = true;
  }

  filterCards() {
    if (!this.drawSpecificCardStack) {
      this.filteredCards = [];
      return;
    }
    
    const hiddenCardName = this.translate.instant('simulator.hidden-card').toLowerCase();
    
    if (!this.drawSpecificCardSearchQuery.trim()) {
      this.filteredCards = [...this.drawSpecificCardStack.cards];
    } else {
      const query = this.drawSpecificCardSearchQuery.toLowerCase();
      this.filteredCards = this.drawSpecificCardStack.cards.filter(gameCard => {
        const isVisible = gameCard.faceUp || this.drawSpecificCardRevealHidden;
        const displayName = isVisible ? gameCard.card.name.toLowerCase() : hiddenCardName;
        return displayName.includes(query);
      });
    }
  }

  onDrawSpecificCardSelect(card: GameCard) {
    if (this.drawSpecificCardStack) {
      this.drawSpecificCardFromStack(this.drawSpecificCardStack, card);
      this.drawSpecificCardDialogVisible = false;
      this.drawSpecificCardStack = undefined;
    }
  }

  constructor(
    private decksService: DecksService,
    private cardsService: CardsService,
    private translate: TranslateService,
    public cardTemplatesService: CardTemplatesService,
    public gameStateService: GameSimulatorStateService,
    private ngZone: NgZone
  ) {
    if (!this.gameStateService.initialized) {
      this.gameStateService.resetGame();
    }
  }

  private mouseMoveListener!: (e: MouseEvent) => void;
  private mouseUpListener!: (e: MouseEvent) => void;

  ngOnInit() {
    this.ngZone.runOutsideAngular(() => {
      this.mouseMoveListener = (event: MouseEvent) => this.onWindowMouseMove(event);
      this.mouseUpListener = (event: MouseEvent) => this.onWindowMouseUpCombined(event);
      window.addEventListener('mousemove', this.mouseMoveListener);
      window.addEventListener('mouseup', this.mouseUpListener);
    });
  }

  ngOnDestroy() {
    window.removeEventListener('mousemove', this.mouseMoveListener);
    window.removeEventListener('mouseup', this.mouseUpListener);
  }

  ngAfterViewInit() {
    // Only center if it's the first time initializing layout positions
    if (this.simulatorPan.x === 0 && this.simulatorPan.y === 0 && this.gameBoundary?.nativeElement) {
      // Small timeout guarantees DOM bounding boxes are rendered
      setTimeout(async () => {
        const rect = this.gameBoundary.nativeElement.getBoundingClientRect();
        this.simulatorPan = {
          x: rect.width / 2,
          y: rect.height / 2
        };

        // Wait for the async resetGame to finish loading stacks from the DB
        if (!this.gameStateService.initialized) {
          await this.gameStateService.resetGame();
        }
      }, 0);
    }
  }

  // resetGame is now handled by GameSimulatorStateService


  public mixCards(cards: GameCard[]) {
    for (let i = cards.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [cards[i], cards[j]] = [cards[j], cards[i]];
    }
  }

  public shuffleCards(stack: CardStack) {
    // Mix the cards, then conform them all to the default pile identity.
    this.mixCards(stack.cards);
    stack.cards.forEach(card => card.faceUp = stack.faceUp);
  }


  public rotateStack(stack: CardStack, angle: number) {
    stack.rotation = (stack.rotation || 0) + angle;
    // Apply rotation to all contained cards so they come out rotated
    stack.cards.forEach(card => card.rotation = stack.rotation);
  }

  public rotateCard(card: GameCard, angle: number) {
    card.rotation = (card.rotation || 0) + angle;
  }

  public flipStack(stack: CardStack) {
    if (stack.cards.length === 0 || stack.flipping) {
      return;
    }

    stack.flipping = true;
    setTimeout(() => {
      stack.cards = stack.cards.reverse();
      // Keep internal cards synced with the physical flip, and then also flip
      // the default stack identity.
      stack.cards.forEach(c => c.faceUp = !c.faceUp);
      stack.faceUp = !stack.faceUp;
    }, 200);

    setTimeout(() => {
      stack.flipping = false;
    }, 400);
  }

  public drawCard(stack: CardStack, faceUp: boolean = true) {
    if (stack.cards.length > 0) {
      const drawnCard = stack.cards.pop();
      if (drawnCard) {
        // change position to deck position + offset
        // Reverted to bottom-right offset
        let newX = stack.pos.x + 600 + (Math.random() * 200 - 100);
        let newY = stack.pos.y + 300 + (Math.random() * 200 - 100);

        let width = GameSimulatorComponent.BASE_CARD_WIDTH;
        let height = GameSimulatorComponent.BASE_CARD_HEIGHT;

        const stackEl = document.getElementById(stack.uniqueId);
        let startX = stack.pos.x;
        let startY = stack.pos.y;

        if (stackEl && this.gameBoundary) {
          const rect = stackEl.getBoundingClientRect();
          width = rect.width / this.simulatorZoom;
          height = rect.height / this.simulatorZoom;
        }

        const clampedPos = this.clampPosition({ x: newX, y: newY }, width, height);

        // Animation logic
        // Assign NEW object to trigger change detection
        drawnCard.pos = { x: startX, y: startY };
        drawnCard.faceUp = faceUp;
        drawnCard.rotation = stack.rotation || 0;
        // drawnCard.drawing = true; // Moved down to prevent animating from 0,0

        this.gameStateService.bringToFront(drawnCard);
        this.field.cards.push(drawnCard);

        // If this is a transient stack that has only a single card in it, then
        // dissolve it back into a single card.
        if (stack.cards.length === 1 && stack.transient) {
          // If 1 card remains, pop it out and dissolve the stack container
          const lastCard = stack.cards.pop()!;

          // Match the remaining card to the exact visual state of the stack container
          lastCard.pos = { x: stack.pos.x, y: stack.pos.y };
          lastCard.rotation = stack.rotation || 0;

          this.gameStateService.bringToFront(lastCard);
          this.field.cards.push(lastCard);
          this.deleteItem(this.stacks, stack);
        } else if (stack.cards.length === 0 && stack.transient) {
          // Fallback in case the user drew the very last card without it dissolving
          this.deleteItem(this.stacks, stack);
        }

        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            drawnCard.drawing = true; // Enable transition
            // Assign NEW object for target
            drawnCard.pos = { x: clampedPos.x, y: clampedPos.y };

            setTimeout(() => {
              drawnCard.drawing = false;
            }, 300);
          });
        });
      }
    }
  }

  public onDrawClick(event: MouseEvent, stack: CardStack) {
    event.stopPropagation();
    // Left click only (button 0)
    if (event.button === 0) {
      const faceUp = !event.shiftKey && !event.ctrlKey;
      this.drawCard(stack, faceUp);
    }
  }

  public onDrawAuxClick(event: MouseEvent, stack: CardStack) {
    // Middle click only (button 1)
    if (event.button === 1) {
      event.preventDefault();
      event.stopPropagation();
      this.drawCard(stack, false);
    }
  }

  public drawSpecificCardFromStack(stack: CardStack, cardToDraw: GameCard) {
    const cardIndex = stack.cards.findIndex(c => c.uniqueId === cardToDraw.uniqueId);

    if (cardIndex > -1) {
      // Remove the specific card from the stack array
      const [drawnCard] = stack.cards.splice(cardIndex, 1);

      // Set its properties for being on the field
      drawnCard.faceUp = true;
      drawnCard.rotation = stack.rotation || 0;
      // Position it near the stack it came from for a better user experience
      // Reverted to bottom-right offset
      let newX = stack.pos.x + 50 + (Math.random() * 20 - 10);
      let newY = stack.pos.y + 50 + (Math.random() * 20 - 10);

      let width = GameSimulatorComponent.BASE_CARD_WIDTH;
      let height = GameSimulatorComponent.BASE_CARD_HEIGHT;

      const stackEl = document.getElementById(stack.uniqueId);
      let startX = stack.pos.x;
      let startY = stack.pos.y;

      if (stackEl) {
        const rect = stackEl.getBoundingClientRect();
        width = rect.width / this.simulatorZoom;
        height = rect.height / this.simulatorZoom;
      }

      const clampedPos = this.clampPosition({ x: newX, y: newY }, width, height);

      // Animation logic
      drawnCard.pos = { x: startX, y: startY };
      // drawnCard.drawing = true; // Moved to prevent animating from 0,0

      this.gameStateService.bringToFront(drawnCard);
      // Add the card to the field
      this.field.cards.push(drawnCard);

      // If this is a transient stack that has only a single card in it, then
      // dissolve it back into a single card.
      if (stack.cards.length === 1 && stack.transient) {
        const lastCard = stack.cards.pop()!;
        lastCard.pos = { x: stack.pos.x, y: stack.pos.y };
        lastCard.rotation = stack.rotation || 0;

        this.gameStateService.bringToFront(lastCard);
        this.field.cards.push(lastCard);
        this.deleteItem(this.stacks, stack);
      } else if (stack.cards.length === 0 && stack.transient) {
        this.deleteItem(this.stacks, stack);
      }

      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          drawnCard.drawing = true; // Enable transition
          drawnCard.pos = { x: clampedPos.x, y: clampedPos.y };

          setTimeout(() => {
            drawnCard.drawing = false;
          }, 300);
        });
      });
    }
  }

  public playCard(cards: GameCard[], card: GameCard) {
    const index = cards.indexOf(card);
    if (index > -1) {
      cards.splice(index, 1);
      this.gameStateService.bringToFront(card);
      this.field.cards.push(card);
    }
  }

  public discardCard(cards: GameCard[], card: GameCard) {
    const index = cards.indexOf(card);
    if (index > -1) {
      card.discarding = true;
      card.faceUp = true; // Ensure face up while confirming discard

      // Animate to discard pile
      let width = GameSimulatorComponent.BASE_CARD_WIDTH;
      let height = GameSimulatorComponent.BASE_CARD_HEIGHT;
      const stackEl = document.getElementById(this.discard.uniqueId);
      if (stackEl) {
        width = stackEl.getBoundingClientRect().width;
        height = stackEl.getBoundingClientRect().height;
      }

      // Target position
      const targetPos = this.clampPosition(
        { x: this.discard.pos.x, y: this.discard.pos.y },
        width,
        height
      );

      // Apply position (CDK Drag will follow this if bound correctly, 
      // otherwise angular binding [cdkDragScale]="simulatorZoom"
      card.pos = targetPos;

      // Wait for animation
      setTimeout(() => {
        // Double check index in case it changed (unlikely in single threaded JS but good practice if async intervened)
        const idx = cards.indexOf(card);
        if (idx > -1) {
          cards.splice(idx, 1);
          card.discarding = false; // Reset state so it's interactable if drawn again
          this.discard.cards.push(card);
        }
      }, 500);
    }
  }

  public flipCard(card: GameCard) {
    if (card.flipping) return; // Prevent double trigger

    card.flipping = true;
    setTimeout(() => {
      card.faceUp = !card.faceUp;
    }, 200); // Half of animation duration

    setTimeout(() => {
      card.flipping = false;
    }, 400); // Full animation duration
  }

  public deleteItem(items: Positionable[], item: Positionable) {
    const index = items.indexOf(item);
    if (index > -1) {
      items.splice(index, 1);
    }
  }

  public recallDeck(targetStack: CardStack) {
    if (!targetStack.originDeckId) return;

    const collectedCards: GameCard[] = [];

    // Scan the field for all cards that are marked with the ID of the deck
    // and pull them back.
    for (let i = this.field.cards.length - 1; i >= 0; i--) {
        const card = this.field.cards[i];
        if (card.originDeckId === targetStack.originDeckId) {
            collectedCards.push(card);
            this.field.cards.splice(i, 1);
        }
    }

    // Now scan all of the other stacks that are known and pull them out of
    // there as well.
    for (let i = this.stacks.length - 1; i >= 0; i--) {
        const stack = this.stacks[i];
        if (stack === targetStack) continue;

        for (let j = stack.cards.length - 1; j >= 0; j--) {
            const card = stack.cards[j];
            if (card.originDeckId === targetStack.originDeckId) {
                collectedCards.push(card);
                stack.cards.splice(j, 1);
            }
        }

        // If this stack is now empty and it's transient, then we can delete 
        // that stack as well, since it is no longer needed.
        if (stack.cards.length === 0 && stack.transient) {
            this.stacks.splice(i, 1);
        }
    }

    // Put all of the collected cards back into the target stack, and shuffle
    // it.
    if (collectedCards.length > 0) {
        targetStack.cards.push(...collectedCards);
        
        // Trigger the visual shuffle animation
        targetStack.shuffling = true;
        setTimeout(() => {
            this.shuffleCards(targetStack);
            targetStack.shuffling = false;
        }, 600);
    }
  }

  public async onStackContextMenu(event: MouseEvent, cm: ContextMenu, stack: CardStack) {
    cm.hide();
    event.preventDefault();
    event.stopPropagation();
    if (this.draggingCard || this.draggingStack || this.draggingComponent) {
      return;
    }    
    const deckIds = stack.cards.map((card) => card.card.deckId)
      .filter((value, index, array) => array.indexOf(value) === index);
    const optionAttributes = await Promise.all(deckIds.map((deckId) => this.cardsService.getFieldsUnfiltered({ deckId: deckId })))
      .then((fieldArrays) => {
        const allFields = fieldArrays.flatMap((fieldArray) => fieldArray);
        const uniqueFields: EntityField<Card>[] = [];
        const seenFields = new Set<string>();
        for (const field of allFields) {
          if (field.field === 'id' || field.field === 'deckId' ||
            field.field === 'frontCardTemplateId' || field.field === 'backCardTemplateId') {
            continue;
          }
          if (field.type !== FieldType.dropdown && field.type !== FieldType.text && field.type !== FieldType.numeric && field.type !== FieldType.dropdownOptions) {
            continue;
          }
          if (!seenFields.has(field.field as string)) {
            seenFields.add(field.field as string);
            uniqueFields.push(field);
          }
        }
        return uniqueFields;
      });

    this.contextMenuItems = [
      {
        label: this.translate.instant('simulator.draw-card'),
        icon: 'pi pi-plus',
        command: () => this.drawCard(stack),
        "disabled": stack.cards.length === 0
      },
      {
        label: this.translate.instant('simulator.rename-stack'),
        icon: 'pi pi-pencil',
        command: () => {
          this.stackToRename = stack;
          this.renameStackName = stack.name;
          this.renameDialogVisible = true;
        },
        disabled: stack === this.discard
      },
      {
        label: this.translate.instant('simulator.draw-card-facedown'),
        icon: 'pi pi-eye-slash',
        command: () => this.drawCard(stack, false),
        disabled: stack.cards.length === 0
      },
      {
        label: this.translate.instant('simulator.draw-specific-card'),
        icon: 'pi pi-id-card',
        disabled: stack.cards.length === 0,
        command: () => this.openDrawSpecificCardDialog(stack)
      },
      {
        label: this.translate.instant('simulator.recall-deck'),
        icon: 'pi pi-inbox',
        visible: !!stack.originDeckId,
        command: () => this.recallDeck(stack)
      },
      {
        label: this.translate.instant('simulator.shuffle-stack'),
        icon: 'pi pi-arrow-right-arrow-left',
        command: (event: any) => {
          stack.shuffling = true;
          setTimeout(() => {
            this.shuffleCards(stack);
            stack.shuffling = false;
          }, 600);
        },
        disabled: stack.cards.length < 2
      },
      {
        label: this.translate.instant('simulator.mix-stack'),
        icon: 'pi pi-sort-alt',
        command: (event: any) => {
          stack.shuffling = true;
          setTimeout(() => {
            this.mixCards(stack.cards);
            stack.shuffling = false;
          }, 600);
        },
        disabled: stack.cards.length < 2
      },
      {
        label: this.translate.instant('simulator.flip-stack'),
        icon: 'pi pi-refresh',
        command: () => this.flipStack(stack),
        disabled: stack.cards.length === 0
      },
      {
        label: this.translate.instant('simulator.rotate-left'),
        icon: 'pi pi-undo',
        command: () => this.rotateStack(stack, -90)
      },
      {
        label: this.translate.instant('simulator.rotate-right'),
        icon: 'pi pi-refresh',
        command: () => this.rotateStack(stack, 90)
      },
      {
        label: this.translate.instant('simulator.split-in-half'),
        icon: 'pi pi-clone',
        command: () => this.splitInHalf(stack),
        disabled: stack.cards.length < 2
      },
      {
        label: this.translate.instant('simulator.split-by-attribute'),
        icon: 'pi pi-clone',
        disabled: stack.cards.length === 0 || optionAttributes.length < 1,
        // Dynamically create a submenu for each card in the stack
        // items: stack.cards.map(gameCard => ({
        //   label: gameCard.card.name,
        //   command: () => this.drawSpecificCardFromStack(stack, gameCard)
        // })),
        items: optionAttributes.map(attribute => ({
          label: attribute.header,
          command: () => this.splitByAttribute(stack, attribute)
        }))
      },
      {
        label: this.translate.instant('simulator.split-by-deck'),
        icon: 'pi pi-clone',
        visible: new Set(stack.cards.map(card => card.originDeckId)).size > 1,
        command: () => this.splitByDeck(stack)
      },
      {
        label: this.translate.instant('simulator.delete'),
        icon: 'pi pi-trash',
        command: () => this.deleteItem(this.stacks, stack),
        disabled: !stack.deletable
      },
    ];
    setTimeout(() => cm.show(event));
  }

  public flipComponent(component: GameComponent) {
    if (component.flipping) return;

    component.flipping = true;
    setTimeout(() => {
      component.faceUp = !component.faceUp;
    }, 200);

    setTimeout(() => {
      component.flipping = false;
    }, 400);
  }

  public rollDie(component: GameComponent) {
    if (component.rolling) return;
    component.rolling = true;
    setTimeout(() => {
      component.face = MathUtils.randomInt(1, 6);
      component.rolling = false;
    }, 600);
  }

  public flipCoin(component: GameComponent) {
    if (component.rolling) return;
    component.rolling = true;
    setTimeout(() => {
      component.faceUp = Math.random() < 0.5;
      component.rolling = false;
    }, 600);
  }

  public onCardContextMenu(event: MouseEvent, cm: ContextMenu, card: GameCard) {
    cm.hide();
    event.preventDefault();
    event.stopPropagation();
    if (this.draggingCard || this.draggingStack || this.draggingComponent) {
      return;
    }
    this.contextMenuItems = [
      {
        label: this.translate.instant('simulator.flip-card'),
        icon: 'pi pi-refresh',
        command: () => this.flipCard(card)
      },
      {
        label: this.translate.instant('simulator.toggle-holographic'),
        icon: 'pi pi-star',
        command: () => card.holographic = !card.holographic
      },
      {
        label: this.translate.instant('simulator.rotate-left'),
        icon: 'pi pi-undo',
        command: () => this.rotateCard(card, -90)
      },
      {
        label: this.translate.instant('simulator.rotate-right'),
        icon: 'pi pi-refresh',
        command: () => this.rotateCard(card, 90)
      },
      {
        label: this.translate.instant('simulator.create-stack'),
        icon: 'pi pi-book',
        command: () => this.createStack(this.field.cards, card)
      },
      {
        label: this.translate.instant('simulator.discard-card'),
        icon: 'pi pi-trash',
        command: () => this.discardCard(this.field.cards, card)
      }
    ];
    setTimeout(() => cm.show(event));
  }

  public onComponentContextMenu(event: MouseEvent, cm: ContextMenu,
    component: GameComponent) {
    cm.hide();
    event.preventDefault();
    event.stopPropagation();
    if (this.draggingCard || this.draggingStack || this.draggingComponent) {
      return;
    }    
    this.contextMenuItems = [
      ...component.contextMenu,
      {
        label: this.translate.instant('simulator.duplicate'),
        icon: 'pi pi-clone',
        command: () => {
          const newComp = {
            ...component,
            uniqueId: component.type + '-' + StringUtils.generateRandomString(),
            pos: {
              x: component.pos.x + 100 + (Math.random() * 100 - 50),
              y: component.pos.y + 100 + (Math.random() * 100 - 50)
            },
          };
          this.gameStateService.bringToFront(newComp);
          this.components.push(newComp);
        },
      },
      {
        label: this.translate.instant('simulator.delete'),
        icon: 'pi pi-trash',
        command: () => this.deleteItem(this.components, component),
      },
    ];
    this.contextMenuItems.forEach(item => {
      item.state = component;
    })
    setTimeout(() => cm.show(event));
  }

  public onFieldContextMenu(event: MouseEvent, cm: ContextMenu) {
    cm.hide();
    event.preventDefault();
    event.stopPropagation();    
    if (this.draggingCard || this.draggingStack || this.draggingComponent) {
      return;
    }
    let boundaryLeft = 0;
    let boundaryTop = 0;
    if (this.gameBoundary && this.gameBoundary.nativeElement) {
      const rect = this.gameBoundary.nativeElement.getBoundingClientRect();
      boundaryLeft = rect.left;
      boundaryTop = rect.top;
    }

    // Scale client pointer coordinate natively into simulator virtual 1.0 bounding board logic.
    const logicalX = (event.clientX - boundaryLeft - this.simulatorPan.x) / this.simulatorZoom;
    const logicalY = (event.clientY - boundaryTop - this.simulatorPan.y) / this.simulatorZoom;

    this.contextMenuItems = [
      {
        label: this.translate.instant('simulator.add-coin'),
        icon: 'pi pi-plus',
        items: GameSimulatorComponent.COLORS.map(color => ({
          label: StringUtils.kebabToTitleCase(color),
          command: () => {
            const component: GameComponent = {
              uniqueId: 'coin-' + StringUtils.generateRandomString(),
              type: 'coin',
              className: 'game-coin color-' + color,
              faceUp: true,
              pos: {
                x: logicalX,
                y: logicalY
              },
              contextMenu: [],
            };
            component.contextMenu = [
              {
                label: this.translate.instant('simulator.flip-randomly'),
                icon: 'pi pi-percentage',
                command: (event: any) => {
                  const componentState: GameComponent | undefined =
                    event.item?.state as GameComponent;
                  if (componentState) {
                    this.flipCoin(componentState);
                  }
                }
              },
              {
                label: this.translate.instant('simulator.flip-over'),
                icon: 'pi pi-refresh',
                command: (event: any) => {
                  const componentState: GameComponent | undefined =
                    event.item?.state as GameComponent;
                  if (componentState) {
                    this.flipComponent(componentState);
                  }
                }
              },
            ];
            this.gameStateService.bringToFront(component);
            this.components.push(component);
          }
        }))
      },
      {
        label: this.translate.instant('simulator.add-cube'),
        icon: 'pi pi-plus',
        items: GameSimulatorComponent.COLORS.map(color => ({
          label: StringUtils.kebabToTitleCase(color),
          command: () => {
            const component: GameComponent = {
              uniqueId: 'cube-' + StringUtils.generateRandomString(),
              type: 'cube',
              className: `game-cube color-${color}`,
              faceUp: true,
              pos: {
                x: logicalX,
                y: logicalY
              },
              contextMenu: [
                {
                  label: this.translate.instant('simulator.flip-over'),
                  icon: 'pi pi-refresh',
                  command: (event: any) => {
                    const componentState: GameComponent | undefined =
                      event.item?.state as GameComponent;
                    if (componentState) {
                      this.flipComponent(componentState);
                    }
                  }
                },
              ],
            };
            this.gameStateService.bringToFront(component);
            this.components.push(component);
          }
        }))
      },
      {
        label: this.translate.instant('simulator.add-die') + ' (D6)',
        icon: 'pi pi-plus',
        items: GameSimulatorComponent.COLORS.map(color => ({
          label: StringUtils.kebabToTitleCase(color),
          command: () => {
            const component: GameComponent = {
              uniqueId: 'd6-' + StringUtils.generateRandomString(),
              type: 'd6',
              className: `game-d6 color-${color}`,
              faceUp: true,
              face: 6,
              pos: {
                x: logicalX,
                y: logicalY
              },
              contextMenu: [
                {
                  label: this.translate.instant('simulator.roll-die'),
                  icon: 'pi pi-percentage',
                  command: (event: any) => {
                    const componentState: GameComponent | undefined =
                      event.item?.state as GameComponent;
                    if (componentState) {
                      this.rollDie(componentState);
                    }
                  }
                },
              ],
            };
            this.gameStateService.bringToFront(component);
            this.components.push(component);
          }
        }))
      },
      {
        label: this.translate.instant('simulator.add-pawn'),
        icon: 'pi pi-plus',
        items: GameSimulatorComponent.COLORS.map(color => ({
          label: StringUtils.kebabToTitleCase(color),
          command: () => {
            const component: GameComponent = {
              uniqueId: 'pawn-' + StringUtils.generateRandomString(),
              type: 'pawn',
              className: `game-pawn color-${color}`,
              faceUp: true,
              pos: {
                x: logicalX,
                y: logicalY
              },
              contextMenu: [
                {
                  label: this.translate.instant('simulator.flip-over'),
                  icon: 'pi pi-refresh',
                  command: (event: any) => {
                    const componentState: GameComponent | undefined =
                      event.item?.state as GameComponent;
                    if (componentState) {
                      this.flipComponent(componentState);
                    }
                  }
                },
              ],
            };
            this.gameStateService.bringToFront(component);
            this.components.push(component);
          }
        }))
      },
      {
        separator: true
      },
      {
        label: this.translate.instant('simulator.zoom'),
        icon: 'pi pi-search',
        items: [
          {
            label: 'Tiny',
            command: () => { this.simulatorZoom = 0.15; this.clampAllItems(); }
          },
          {
            label: 'Small',
            command: () => { this.simulatorZoom = 0.20; this.clampAllItems(); }
          },
          {
            label: 'Regular',
            command: () => { this.simulatorZoom = 0.25; this.clampAllItems(); }
          },
          {
            label: 'Large',
            command: () => { this.simulatorZoom = 0.30; this.clampAllItems(); }
          },
          {
            label: 'Huge',
            command: () => { this.simulatorZoom = 0.35; this.clampAllItems(); }
          }
        ]
      },
      {
        separator: true
      },
      {
        label: this.translate.instant('simulator.reset-game'),
        icon: 'pi pi-refresh',
        command: () => this.gameStateService.resetGame(),
      },
      {
        label: this.translate.instant('simulator.update-game-state'),
        icon: 'pi pi-sync',
        command: () => this.gameStateService.updateGameState(),
      },
      {
        separator: true
      },
      {
        label: this.translate.instant('simulator.shortcuts'),
        icon: 'pi pi-question-circle',
        command: () => this.showShortcuts(),
      },
    ];
    setTimeout(() => cm.show(event));
  }

  public createStack(cards: GameCard[], card: GameCard) {
    const index = cards.indexOf(card);
    if (index < 0) {
      return
    }
    cards.splice(index, 1);
    const newCards: GameCard[] = [card];
    const newStack: CardStack = {
      uniqueId: StringUtils.generateRandomString(),
      name: 'stack-' + StringUtils.generateRandomString(3),
      cards: newCards,
      faceUp: card.faceUp,
      pos: { x: card.pos.x, y: card.pos.y },
      rotation: card.rotation,
      deletable: true,
      transient: false,
    };
    this.gameStateService.bringToFront(newStack);
    this.stacks.push(newStack);
  }

  public splitInHalf(stack: CardStack) {
    if (stack.cards.length < 2) {
      return;
    }
    // split the stack in half and push the new stack into the stacks array
    const cards = stack.cards.splice(
      Math.floor(stack.cards.length / 2) - 1,
      Math.floor(stack.cards.length / 2));
    const newStack: CardStack = {
      uniqueId: StringUtils.generateRandomString(),
      name: stack.name + ' copy',
      cards: cards,
      faceUp: stack.faceUp,
      pos: {
        x: stack.pos.x + 50 + (Math.random() * 20 - 10),
        y: stack.pos.y + 50 + (Math.random() * 20 - 10)
      },
      deletable: true,
      transient: true,
    };
    this.gameStateService.bringToFront(newStack);
    this.stacks.push(newStack);
  }

  public splitByAttribute(stack: CardStack, attribute: EntityField<Card>) {
    if (stack.cards.length < 2) {
      return;
    }
    const uniqueValues = Array.from(new Set(stack.cards.map(card => card.card[attribute.field])));

    const newStacks = uniqueValues.map((value) => {
      const displayValue = (value === undefined || value === null || (typeof value === 'string' && value.trim() === '')) ? 'None' : String(value);
      return {
        uniqueId: StringUtils.generateRandomString(),
        name: stack.name + ' ' + displayValue,
        cards: stack.cards.filter((card) => card.card[attribute.field] === value),
        faceUp: stack.faceUp,
        pos: {
          x: stack.pos.x + (Math.random() * 100 - 50),
          y: stack.pos.y + (Math.random() * 100 - 50)
        },
        deletable: true,
        transient: stack.transient,
      } as CardStack;
    }).filter((cardStack) => cardStack.cards.length > 0);

    // remove cards taken out of the main stack, and remove stack if empty and deletable
    stack.cards = stack.cards.filter((card) => !newStacks?.some((newStack) => newStack.cards.includes(card)));
    if (stack.cards.length < 1 && stack.deletable) {
      this.deleteItem(this.stacks, stack);
    }

    // add new stacks to the game
    newStacks?.forEach((stack) => {
      this.gameStateService.bringToFront(stack);
      this.stacks.push(stack);
    });
  }

  public splitByDeck(stack: CardStack) {
    if (stack.cards.length < 2) {
      return;
    }
    
    // Grab all unique deck lineages present in this stack
    const uniqueOrigins = Array.from(new Set(stack.cards.map(card => card.originDeckId).filter(id => id)));

    // Exclude the source stack's own origin ID so it retains its native cards
    const originsToExtract = uniqueOrigins.filter(id => id !== stack.originDeckId);

    if (originsToExtract.length < 1) {
      return;
    }

    const newStacks = originsToExtract.map((originId) => {
      // Cross-check to find the original base deck for this origin ID
      const baseStack = this.stacks.find(s => s.originDeckId === originId && !s.transient);
      const deckName = baseStack ? baseStack.name : 'Unknown Deck';

      return {
        uniqueId: StringUtils.generateRandomString(),
        name: `${deckName} split`,
        cards: stack.cards.filter((card) => card.originDeckId === originId),
        faceUp: stack.faceUp,
        pos: {
          x: stack.pos.x + (Math.random() * 100 - 50),
          y: stack.pos.y + (Math.random() * 100 - 50)
        },
        deletable: true,
        transient: true,
      } as CardStack;
    }).filter((cardStack) => cardStack.cards.length > 0);

    // remove cards taken out of the main stack, and remove stack if empty and deletable
    stack.cards = stack.cards.filter((card) => !newStacks.some((newStack) => newStack.cards.includes(card)));
    if (stack.cards.length < 1 && stack.deletable) {
      this.deleteItem(this.stacks, stack);
    }

    // add new stacks to the game
    newStacks?.forEach((stack) => {
      this.gameStateService.bringToFront(stack);
      this.stacks.push(stack);
    });
  }

  public onDragStarted(event: CdkDragStart, items: Positionable[], item: Positionable) {
    this.gameStateService.bringToFront(item);
    // send card to the end of the cards array
    const index = items.indexOf(item);
    if (index > -1) {
      items.splice(index, 1);
      items.push(item);
    }
    this.hoveredItem = undefined;

    // Check if we are dragging a stack or a component
    if (items === this.stacks) {
      this.draggingStack = true;
    } else if (items === this.components) {
      this.draggingComponent = true;
    }
  }

  public onCardDragStarted(event: CdkDragStart, cards: GameCard[], card: GameCard) {
    this.gameStateService.bringToFront(card);
    this.draggingCard = true;
  }

  onDragEnded(event: CdkDragEnd<any>, items: Positionable[], item: Positionable) {
    // Capture the original position before applying the new drag position
    const originalPos = { x: item.pos.x, y: item.pos.y };

    const rawPos = event.source.getFreeDragPosition();
    const pos = { x: rawPos.x / this.simulatorZoom, y: rawPos.y / this.simulatorZoom };

    let width = GameSimulatorComponent.BASE_CARD_WIDTH;
    let height = GameSimulatorComponent.BASE_CARD_HEIGHT;

    const rootEl = event.source.getRootElement();
    if (rootEl) {
      const rect = rootEl.getBoundingClientRect();
      width = rect.width / this.simulatorZoom;
      height = rect.height / this.simulatorZoom;
    }

    // Use consistent world-space clamping (no manual normalization needed with cdkDragScale)
    item.pos = this.clampPosition({ x: pos.x, y: pos.y }, width, height, 0);

    if (this.draggingStack && this.hoveredItem && this.hoveredItem !== item) {
      const targetStack = this.hoveredItem as CardStack;
      const sourceStack = item as CardStack;

      // Move all cards from source to target
      if (this.isCtrlPressed) {
        targetStack.cards.unshift(...sourceStack.cards);
      } else {
        targetStack.cards.push(...sourceStack.cards);
      }

      // Transient stacks get destroyed, but we put all other stacks bac to
      // where they started.
      if (sourceStack.transient) {
        this.deleteItem(this.stacks, sourceStack);
      } else {
        sourceStack.cards = [];
        
        // Defer setting the position for the source stack so that Angular 
        // notices the change.
        setTimeout(() => {
          sourceStack.pos = originalPos;
        });
      }

      this.hoveredItem = undefined;
    }

    // Clear the drag states depending on what array was passed
    if (items === this.stacks) {
      this.draggingStack = false;
    } else if (items === this.components) {
      this.draggingComponent = false;
    }
  }

  onCardDragEnded(event: CdkDragEnd<any>, cards: GameCard[], card: GameCard) {
    const rawPos = event.source.getFreeDragPosition();
    const pos = { x: rawPos.x / this.simulatorZoom, y: rawPos.y / this.simulatorZoom };

    let width = GameSimulatorComponent.BASE_CARD_WIDTH;
    let height = GameSimulatorComponent.BASE_CARD_HEIGHT;

    const rootEl = event.source.getRootElement();
    if (rootEl) {
      const rect = rootEl.getBoundingClientRect();
      width = rect.width / this.simulatorZoom;
      height = rect.height / this.simulatorZoom;
    }

    // Use consistent world-space clamping (no manual normalization needed with cdkDragScale)
    card.pos = this.clampPosition({ x: pos.x, y: pos.y }, width, height, 0);
    console.log(`Drag Ended [Card]: ${card.uniqueId} | Pos:`, card.pos, `| Zoom: ${this.simulatorZoom}`);
    if (this.hoveredItem && this.hoveredItem !== card) {
      const targetItem = this.hoveredItem as any;

      // If the target is a card stack, then we can push this card onto it.
      if (targetItem.cards && targetItem.uniqueId) {
        const index = cards.indexOf(card);
        if (index > -1) {
          cards.splice(index, 1);
        }
        if (this.isCtrlPressed) {
          targetItem.cards.unshift(card);
        } else {
          targetItem.cards.push(card);
        }
      }

      // If the target is another Game Card, then drop it, but create a new stack if Shift is held.
      else if (targetItem.card && targetItem.uniqueId && (this.isShiftPressed || this.isCtrlPressed)) {
        const sourceIndex = cards.indexOf(card);
        if (sourceIndex > -1) {
          cards.splice(sourceIndex, 1);
        }

        const targetIndex = cards.indexOf(targetItem);
        if (targetIndex > -1) {
          cards.splice(targetIndex, 1);
        }

        const stackCards = this.isCtrlPressed ? [card, targetItem] : [targetItem, card];

        const newStack: CardStack = {
          uniqueId: StringUtils.generateRandomString(),
          name: 'Stack',
          cards: stackCards,
          faceUp: targetItem.faceUp,
          pos: { x: targetItem.pos.x, y: targetItem.pos.y },
          rotation: targetItem.rotation,
          deletable: true,
          transient: true,
        };
        this.gameStateService.bringToFront(newStack);
        this.stacks.push(newStack);
      }

      // Crucial: Clear hoveredItem to prevent ghost merging on future drops!
      this.hoveredItem = undefined;
    }
    this.draggingCard = false;
  }

  onMouseEntered(event: any, item: Positionable) {
    if (this.hoveredItem == item) {
      return;
    }
    // console.log('mouse entered: ', event, item);
    this.hoveredItem = item;
  }

  onMouseExited(event: any, item: Positionable) {
    // console.log('mouse exited: ', event, item);
    if (this.hoveredItem == item) {
      this.hoveredItem = undefined;
    }
  }

  magnifiedCard: GameCard | undefined;
  magnifiedPos: Position = { x: 0, y: 0 };

  // ... (previous code)

  onCardMouseDown(event: MouseEvent, card: GameCard) {
    if (event.button == 1) {
      this.calculateMagnifiedPosition(event, card);
      this.magnifiedCard = card;
      event.preventDefault(); // Prevent default middle click scroll
    }
  }

  onCardMouseUp(event: MouseEvent, card: GameCard) {
    if (event.button == 1) {
      this.magnifiedCard = undefined;
    }
  }

  onStackMouseDown(event: MouseEvent, stack: CardStack) {
    if (event.button == 1) {
      if (stack.cards.length > 0) {
        this.calculateMagnifiedPosition(event, stack);
        this.magnifiedCard = stack.cards[stack.cards.length - 1];
      }
      event.preventDefault(); // Prevent default middle click scroll
    }
  }

  onStackMouseUp(event: MouseEvent, stack: CardStack) {
    if (event.button == 1) {
      this.magnifiedCard = undefined;
    }
  }

  onComponentMouseDown(event: MouseEvent, component: GameComponent) {
    if (event.button == 1) {
      event.stopPropagation();
    }
  }

  onComponentAuxClick(event: MouseEvent, component: GameComponent) {
    if (event.button == 1) {
      event.preventDefault();
      event.stopPropagation();
      this.gameStateService.bringToFront(component);

      if (component.type === 'd6') {
        this.rollDie(component);
      } else if (component.type === 'coin') {
        this.flipCoin(component);
      } else if (component.type === 'cube' || component.type === 'pawn') {
        this.flipComponent(component);
      }
    }
  }

  @HostListener('window:mouseup', ['$event'])
  onWindowMouseUp(event: MouseEvent) {
    if (event.button == 1) {
      this.magnifiedCard = undefined;
    }
  }

  private clampAllItems() {
    const defaultCardWidth = GameSimulatorComponent.BASE_CARD_WIDTH;
    const defaultCardHeight = GameSimulatorComponent.BASE_CARD_HEIGHT;

    // Clamp Stacks
    this.stacks.forEach(stack => {
      let width = defaultCardWidth;
      let height = defaultCardHeight;
      const el = document.getElementById(stack.uniqueId);
      if (el) {
        width = el.getBoundingClientRect().width;
        height = el.getBoundingClientRect().height;
      }
      const newPos = this.clampPosition(stack.pos, width, height);
      stack.pos = { x: newPos.x, y: newPos.y };
    });

    // Clamp Cards
    this.field.cards.forEach(card => {
      let width = defaultCardWidth;
      let height = defaultCardHeight;
      const el = document.getElementById(card.uniqueId);
      if (el) {
        width = el.getBoundingClientRect().width;
        height = el.getBoundingClientRect().height;
      }
      const newPos = this.clampPosition(card.pos, width, height);
      card.pos = { x: newPos.x, y: newPos.y };
    });

    // Clamp Components (Dice/Coins)
    // Approximate size 50x50
    const componentSize = 50;
    this.components.forEach(comp => {
      let width = componentSize;
      let height = componentSize;
      const el = document.getElementById(comp.uniqueId);
      if (el) {
        width = el.getBoundingClientRect().width;
        height = el.getBoundingClientRect().height;
      }
      const newPos = this.clampPosition(comp.pos, width, height);
      comp.pos = { x: newPos.x, y: newPos.y };
    });
  }

  private clampPosition(pos: Position, itemWidth: number, itemHeight: number, padding: number = 0): Position {
    // Clamping to a large virtual table instead of the viewport
    const TABLE_MIN = GameSimulatorComponent.TABLE_MIN;
    const TABLE_MAX = GameSimulatorComponent.TABLE_MAX;

    const maxX = TABLE_MAX - itemWidth - padding;
    const maxY = TABLE_MAX - itemHeight - padding;

    return {
      x: Math.max(TABLE_MIN + padding, Math.min(maxX, pos.x)),
      y: Math.max(TABLE_MIN + padding, Math.min(maxY, pos.y))
    };
  }

  public handleDragPosition = (proposedPosition: Point, _dragRef: DragRef, dimensions: any, pickupPositionInElement: Point): Point => {
    // 1. Proposed position is the unscaled screen cursor `point`.
    // Calculate the screen position of the card's top-left corner
    const screenTopLeft = {
      x: proposedPosition.x - (pickupPositionInElement?.x || 0),
      y: proposedPosition.y - (pickupPositionInElement?.y || 0)
    };

    // 2. Adjust for Game Boundary offset relative to browser viewport
    let boundaryLeft = 0;
    let boundaryTop = 0;
    if (this.gameBoundary && this.gameBoundary.nativeElement) {
      const rect = this.gameBoundary.nativeElement.getBoundingClientRect();
      boundaryLeft = rect.left;
      boundaryTop = rect.top;
    }

    // 3. Map screen coordinate to local logical world-space coordinate
    const logicalX = (screenTopLeft.x - boundaryLeft - this.simulatorPan.x) / this.simulatorZoom;
    const logicalY = (screenTopLeft.y - boundaryTop - this.simulatorPan.y) / this.simulatorZoom;

    let width = GameSimulatorComponent.BASE_CARD_WIDTH;
    let height = GameSimulatorComponent.BASE_CARD_HEIGHT;

    const rootEl = _dragRef.getRootElement();
    if (rootEl) {
      const rect = rootEl.getBoundingClientRect();
      width = rect.width / this.simulatorZoom;
      height = rect.height / this.simulatorZoom;
    }

    // 4. Clamp the logical coordinates to the virtual table
    const clampedLogical = this.clampPosition({ x: logicalX, y: logicalY }, width, height, 0);

    // 5. Map the clamped logical coordinates BACK to screen space for Angular CDK
    // Since we provide a constrainPosition callback, CDK uses offset expectations relative to the top-left rather than cursor.
    const clampedScreenX = (clampedLogical.x * this.simulatorZoom) + this.simulatorPan.x + boundaryLeft;
    const clampedScreenY = (clampedLogical.y * this.simulatorZoom) + this.simulatorPan.y + boundaryTop;

    return {
      x: clampedScreenX,
      y: clampedScreenY
    };
  }


  private calculateMagnifiedPosition(event: MouseEvent, item: Positionable) {
    let width = 300; // Fallback
    let height = 420; // Fallback

    // Attempt to calculate actual target dimensions based on the source element
    const el = document.getElementById((item as any).uniqueId);
    if (el) {
      const rect = el.getBoundingClientRect();
      // Calculate base dimensions (unscaled)
      const baseWidth = rect.width;
      const baseHeight = rect.height;

      // Calculate target dimensions
      width = baseWidth * this.zoomMagnifiedLevel;
      height = baseHeight * this.zoomMagnifiedLevel;
    }

    const padding = 20;

    let x = event.clientX;
    let y = event.clientY;

    // Clamp to window
    const minX = width / 2 + padding;
    const maxX = window.innerWidth - (width / 2) - padding;
    const minY = height / 2 + padding;
    const maxY = window.innerHeight - (height / 2) - padding;

    this.magnifiedPos.x = Math.max(minX, Math.min(maxX, x));
    this.magnifiedPos.y = Math.max(minY, Math.min(maxY, y));
  }

  public getStackDepthStyle(rotation: number = 0) {
    const rad = rotation * (Math.PI / 180);
    // Target vector is (1, 1) for "Down-Right" bias
    // We want local vector (x, y) such that Rotate(x,y) = (1, 1) relative to screen axes
    // Inverse rotation:
    // x = x' cos(a) + y' sin(a)
    // y = -x' sin(a) + y' cos(a)
    // with x'=1, y'=1
    const x = Math.cos(rad) + Math.sin(rad);
    const y = -Math.sin(rad) + Math.cos(rad);


    return {
      '--depth-x': x.toFixed(2),
      '--depth-y': y.toFixed(2)
    };
  }

  public getStackCountStyle(rotation: number = 0) {
    // We want to keep the count at the visual "Bottom Right" corner
    // The container (.card-stack) size is fixed to the base orientation (Portrait)
    // The visual content (.card-wrapper) rotates around the center.

    // Normalized rotation (0, 90, 180, 270)
    const rot = ((rotation % 360) + 360) % 360;

    let style: any = {};

    // Base position is bottom: 5px, right: 5px
    // Center is 50%, 50%
    // If 0 deg: bottom/right is correct.
    // If 90 deg: Visual bottom-right is actually (Top, Right) of the container logic?
    // Wait, visual W becomes H.
    // Visual Bottom is Right Side of Container. Visual Right is Top Side of Container.
    // So Visual Bottom-Right is Top-Right of Container.

    // If 180 deg: Visual Bottom-Right is Top-Left of Container.
    // If 270 deg: Visual Bottom-Right is Bottom-Left of Container.

    switch (rot) {
      case 90:
        style = { top: '5px', right: '5px', bottom: 'auto', left: 'auto' };
        break;
      case 180:
        style = { top: '5px', left: '5px', bottom: 'auto', right: 'auto' };
        break;
      case 270:
        style = { bottom: '5px', left: '5px', top: 'auto', right: 'auto' };
        break;
      default: // 0
        style = { bottom: '5px', right: '5px', top: 'auto', left: 'auto' };
        break;
    }
    return style;
  }

  public onWheel(event: WheelEvent) {
    event.preventDefault();

    this.isZooming = true;
    clearTimeout(this.zoomTimeout);
    this.zoomTimeout = setTimeout(() => {
      this.isZooming = false;
    }, 150);

    // On Mac, Shift + Scroll often translates to deltaX instead of deltaY
    const delta = Math.abs(event.deltaY) > Math.abs(event.deltaX) ? event.deltaY : event.deltaX;
    
    // Multiplicative zoom factor (0.999^100 is approx 0.9, 0.999^-100 is approx 1.1)
    const zoomFactor = Math.pow(0.999, delta);
    const oldZoom = this.simulatorZoom;
    const newZoom = Math.max(0.1, Math.min(5, oldZoom * zoomFactor));

    if (oldZoom === newZoom) return;

    // Calculate pan adjustment to zoom at mouse position
    const rect = this.gameBoundary.nativeElement.getBoundingClientRect();
    const mouseX = event.clientX - rect.left;
    const mouseY = event.clientY - rect.top;

    // Formula for zooming at mouse point:
    // newPan = mouse - (mouse - oldPan) * (newZoom / oldZoom)
    this.simulatorPan.x = mouseX - (mouseX - this.simulatorPan.x) * (newZoom / oldZoom);
    this.simulatorPan.y = mouseY - (mouseY - this.simulatorPan.y) * (newZoom / oldZoom);
    this.simulatorZoom = newZoom;

    this.calculateOffScreenIndicators();
  }

  public onSimulatorMouseDown(event: MouseEvent) {
    // Prevent panning if we are currently magnifying a card
    if (this.magnifiedCard) {
      return;
    }

    // Shift + LMB or MMB
    if ((event.shiftKey && event.button === 0) || event.button === 1) {
      this.isPanning = true;
      this.lastPanPos = { x: event.clientX, y: event.clientY };
      event.preventDefault();
      event.stopPropagation();
    }
  }

  onWindowMouseMove(event: MouseEvent) {
    if (this.isPanning) {
      this.ngZone.run(() => {
        const dx = event.clientX - this.lastPanPos.x;
        const dy = event.clientY - this.lastPanPos.y;

        this.simulatorPan.x += dx;
        this.simulatorPan.y += dy;

        this.lastPanPos = { x: event.clientX, y: event.clientY };
        this.calculateOffScreenIndicators();
      });
    }
  }

  // Update existing HostListener for window:mouseup
  onWindowMouseUpCombined(event: MouseEvent) {
    let requiresChangeDetection = false;

    // Failsafe reset if the browser dropped a `keyup` event midway
    if (!event.shiftKey && this.isShiftPressed) {
      this.isShiftPressed = false;
      requiresChangeDetection = true;
    }
    
    if (!event.ctrlKey && this.isCtrlPressed) {
      this.isCtrlPressed = false;
      requiresChangeDetection = true;
    }

    if (event.button == 1 && this.magnifiedCard) {
      this.magnifiedCard = undefined;
      requiresChangeDetection = true;
    }
    if (this.isPanning) {
      this.isPanning = false;
      requiresChangeDetection = true;
    }

    if (requiresChangeDetection) {
      this.ngZone.run(() => {
         // Change detection will fire after this block
      });
    }
  }

  @HostListener('window:keydown', ['$event'])
  onWindowKeyDown(event: KeyboardEvent) {
    if (event.key === 'Shift') {
      this.isShiftPressed = true;
    }
    if (event.key === 'Control') {
      this.isCtrlPressed = true;
    }

    // Do not capture keyboard shortcuts if the user is typing in an input field (like a search box or rename dialog)
    const activeEl = document.activeElement;
    const isInputFocused = activeEl && (activeEl.tagName === 'INPUT' || activeEl.tagName === 'TEXTAREA');

    if (!isInputFocused && this.hoveredItem) {
      const item = this.hoveredItem as any;
      const isCard = item.card !== undefined && item.uniqueId !== undefined;
      const isStack = item.cards !== undefined && item.uniqueId !== undefined;
      const isComponent = item.type !== undefined && item.className !== undefined;

      switch (event.key.toLowerCase()) {
        case ' ':
          if (isStack) {
            event.preventDefault();
            this.drawCard(item as CardStack, !this.isCtrlPressed && !this.isShiftPressed);
          }
          break;
        case 'f':
          if (isCard) {
            this.flipCard(item as GameCard);
          } else if (isStack) {
            this.flipStack(item as CardStack);
          } else if (isComponent) {
            const comp = item as GameComponent;
            this.gameStateService.bringToFront(comp);
            if (comp.type === 'd6') {
              this.rollDie(comp);
            } else if (comp.type === 'coin') {
              this.flipCoin(comp);
            } else if (comp.type === 'cube' || comp.type === 'pawn') {
              this.flipComponent(comp);
            }
          }
          break;
        case 'd':
          if (isCard) {
            this.rotateCard(item as GameCard, -90);
          } else if (isStack) {
            this.rotateStack(item as CardStack, -90);
          }
          break;
        case 'g':
          if (isCard) {
            this.rotateCard(item as GameCard, 90);
          } else if (isStack) {
            this.rotateStack(item as CardStack, 90);
          }
          break;
        case 'q':
          if (isCard && this.field.cards.includes(item as GameCard)) {
            this.discardCard(this.field.cards, item as GameCard);
          }
          break;
      }
    }
  }

  @HostListener('window:keyup', ['$event'])
  onWindowKeyUp(event: KeyboardEvent) {
    if (event.key === 'Shift') {
      this.isShiftPressed = false;
    }
    if (event.key === 'Control') {
      this.isCtrlPressed = false;
    }
  }

  private boundaryRectCache: { width: number, height: number } | null = null;

  @HostListener('window:resize')
  onWindowResize() {
    this.boundaryRectCache = null;
    this.calculateOffScreenIndicators();
  }

  private calculateOffScreenIndicators() {
    if (!this.gameBoundary) return;

    if (!this.boundaryRectCache) {
      const rect = this.gameBoundary.nativeElement.getBoundingClientRect();
      this.boundaryRectCache = { width: rect.width, height: rect.height };
    }
    const boundaryRect = this.boundaryRectCache;

    const indicators = { top: 0, bottom: 0, left: 0, right: 0 };

    const checkItem = (item: Positionable, width: number, height: number) => {
      // Calculate screen position: 
      // screenPos = pan + itemPos * zoom
      const screenX = this.simulatorPan.x + (item.pos.x * this.simulatorZoom);
      const screenY = this.simulatorPan.y + (item.pos.y * this.simulatorZoom);
      const screenWidth = width * this.simulatorZoom;
      const screenHeight = height * this.simulatorZoom;

      if (screenY + screenHeight < 0) indicators.top++;
      else if (screenY > boundaryRect.height) indicators.bottom++;

      if (screenX + screenWidth < 0) indicators.left++;
      else if (screenX > boundaryRect.width) indicators.right++;
    };

    const cardWidth = GameSimulatorComponent.BASE_CARD_WIDTH;
    const cardHeight = GameSimulatorComponent.BASE_CARD_HEIGHT;

    this.stacks.forEach(s => checkItem(s, cardWidth, cardHeight));
    this.field.cards.forEach(c => checkItem(c, cardWidth, cardHeight));
    this.components.forEach(c => checkItem(c, 50, 50));

    // Only update (and trigger change detection) when values actually changed
    const prev = this.offScreenIndicators;
    if (prev.top !== indicators.top || prev.bottom !== indicators.bottom ||
      prev.left !== indicators.left || prev.right !== indicators.right) {
      this.ngZone.run(() => {
        this.offScreenIndicators = indicators;
      });
    }
  }

  private panAnimationId: number | null = null;

  public panToDirection(direction: 'top' | 'bottom' | 'left' | 'right') {
    if (!this.gameBoundary) return;
    const rect = this.gameBoundary.nativeElement.getBoundingClientRect();
    
    let minX = Infinity, minY = Infinity;
    let maxX = -Infinity, maxY = -Infinity;
    let found = false;

    const cardWidth = GameSimulatorComponent.BASE_CARD_WIDTH;
    const cardHeight = GameSimulatorComponent.BASE_CARD_HEIGHT;

    const checkItem = (item: Positionable, width: number, height: number, considerZoom: boolean = true) => {
      // Account for components needing unscaled width but scaled position?
      // Our logic elsewhere scales position and dimensions.
      const screenX = this.simulatorPan.x + (item.pos.x * this.simulatorZoom);
      const screenY = this.simulatorPan.y + (item.pos.y * this.simulatorZoom);
      const screenWidth = width * this.simulatorZoom;
      const screenHeight = height * this.simulatorZoom;

      let isTarget = false;
      if (direction === 'top' && screenY + screenHeight < 0) isTarget = true;
      else if (direction === 'bottom' && screenY > rect.height) isTarget = true;
      else if (direction === 'left' && screenX + screenWidth < 0) isTarget = true;
      else if (direction === 'right' && screenX > rect.width) isTarget = true;

      if (isTarget) {
        found = true;
        minX = Math.min(minX, item.pos.x);
        minY = Math.min(minY, item.pos.y);
        maxX = Math.max(maxX, item.pos.x + width);
        maxY = Math.max(maxY, item.pos.y + height);
      }
    };

    this.stacks.forEach(s => checkItem(s, cardWidth, cardHeight));
    this.field.cards.forEach(c => checkItem(c, cardWidth, cardHeight));
    this.components.forEach(c => checkItem(c, 50, 50));

    if (found) {
      const centerX = (minX + maxX) / 2;
      const centerY = (minY + maxY) / 2;

      // We want this local unit center to appear exactly in the middle of our view
      const targetPanX = (rect.width / 2) - (centerX * this.simulatorZoom);
      const targetPanY = (rect.height / 2) - (centerY * this.simulatorZoom);

      this.smoothPanTo(targetPanX, targetPanY);
    } else {
      this.scrollToCenter();
    }
  }

  private smoothPanTo(targetX: number, targetY: number) {
    if (this.panAnimationId) {
      cancelAnimationFrame(this.panAnimationId);
    }

    const startX = this.simulatorPan.x;
    const startY = this.simulatorPan.y;
    const duration = 250; // ms
    const startTime = performance.now();

    const animate = (time: number) => {
      const elapsed = time - startTime;
      const progress = Math.min(elapsed / duration, 1);
      
      // easeOutCubic
      const easeProgress = 1 - Math.pow(1 - progress, 3);
      
      this.ngZone.run(() => {
        this.simulatorPan.x = startX + (targetX - startX) * easeProgress;
        this.simulatorPan.y = startY + (targetY - startY) * easeProgress;
        this.calculateOffScreenIndicators();
      });
      
      if (progress < 1) {
        this.panAnimationId = requestAnimationFrame(animate);
      } else {
        this.panAnimationId = null;
      }
    };
    
    this.panAnimationId = requestAnimationFrame(animate);
  }

  public scrollToCenter() {
    this.simulatorPan = { x: 0, y: 0 };
    this.calculateOffScreenIndicators();
  }
}
